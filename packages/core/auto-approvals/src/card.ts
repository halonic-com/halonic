// The typed approval card (design section 2). Claims may only block; only
// facts may allow. A fact is written by the Paperclip server or by Git; a
// claim is anything an agent can write. v1 ships no live kinds, so every card
// is `untyped`, and the card records each reason it would be untyped anyway.

import { canonicalJson, contentDigest, type Sha256 } from "@halonicjs/std";
import { stringsIn } from "./claims.ts";
import { type ApprovalSource, approvalSources, isKnown, type PathClass } from "./vocabulary.ts";

/** The approval kinds a rule may name. v1 has none: each comes with its own board card. */
export type ApprovalKind = "untyped";

/** Why a card is `untyped`, besides there being no live kinds in v1. */
export type UntypedReason = "no_live_kinds" | "requester_mismatch";

/** What a card's approval would let happen. */
export type Target =
  | { type: "github_pr"; repoId: number; number: number; baseRef: string; headSha: string }
  | { type: "paperclip_issue_document"; issueId: string; documentId: string; revisionId: string }
  | { type: "none" };

/** Where a card field was read, and when (from the server's `Date` header). */
export interface SourceRef {
  readonly system: "paperclip" | "github";
  readonly endpoint: string;
  readonly readAt: string;
}

/** A board approval as Paperclip's approvals route returns it. */
export interface ApprovalRecord {
  readonly id: string;
  readonly companyId: string;
  /** A claim: the requesting agent picks it. */
  readonly type: string;
  readonly status: string;
  /** A claim: the requesting agent can set it to another agent. */
  readonly requestedByAgentId: string | null;
  readonly decidedByUserId: string | null;
  /** A claim. */
  readonly payload: unknown;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** One activity entry Paperclip's own routes wrote for the approval. */
export interface ActivityEntry {
  readonly action: string;
  readonly actorType: "agent" | "user" | "system";
  readonly actorId: string;
  readonly createdAt: string;
}

/** A comment on the approval. Its body is a claim. */
export interface ApprovalComment {
  readonly authorType: "agent" | "user";
  readonly body: string;
}

/** An issue the approval links to. Its title and description are claims. */
export interface LinkedIssue {
  readonly id: string;
  readonly title: string;
  readonly description: string | null;
}

/** Everything read for one approval, before it becomes a card. */
export interface ApprovalRead {
  /** The Paperclip company Studio is connected to. */
  readonly workspaceId: string;
  readonly approval: ApprovalRecord;
  readonly activity: readonly ActivityEntry[];
  readonly comments: readonly ApprovalComment[];
  readonly linkedIssues: readonly LinkedIssue[];
  /** From `reviewerFor` on the files changed at the pinned head; empty without a PR. */
  readonly pathClasses: readonly PathClass[];
  readonly sources: {
    readonly approval: SourceRef;
    readonly activity: SourceRef;
    readonly comments: SourceRef;
    readonly linkedIssues: SourceRef;
  };
}

/** The typed approval card. It holds no free text, so the ledger can store it. */
export interface ApprovalCard {
  readonly approvalId: string;
  readonly workspaceId: string;
  readonly kind: ApprovalKind;
  readonly untypedBecause: readonly UntypedReason[];
  /** A claim; used only to block. */
  readonly approvalType: string;
  /**
   * Where the approval came from, read from the payload; used only to block.
   * Only a known source is kept: anything else is `other`, so an agent's text
   * never reaches the card.
   */
  readonly approvalSource: ApprovalSource | "other" | null;
  readonly target: Target;
  /** What would be approved: the payload hash while the target is `none`. */
  readonly version: string;
  /** The actor of the `approval.created` activity entry. */
  readonly requester: { readonly kind: "agent" | "user"; readonly id: string };
  readonly linkedIssues: readonly string[];
  readonly pathClasses: readonly PathClass[];
  readonly status: "pending";
  /** No decision, edit, revision request, resubmit or user comment, ever. */
  readonly untouched: boolean;
  readonly payloadHash: string;
  readonly createdAt: string;
  readonly sources: Readonly<Record<string, SourceRef>>;
}

/** Why no card could be made. The approval then gets no decision. */
export type NoCardReason =
  | "card.not_pending"
  | "card.wrong_workspace"
  | "card.no_created_entry"
  | "card.unreadable_payload";

/** A card with the claims to scan for keywords, or why there is none. */
export type CardRead =
  | { readonly ok: true; readonly card: ApprovalCard; readonly claims: readonly string[] }
  | { readonly ok: false; readonly reason: NoCardReason };

/**
 * Builds the typed card for one approval.
 *
 * @param read - the approval and what was read with it
 * @param digest - SHA-256, for the payload hash
 * @returns the card and the claims to scan, or why there is no card
 */
export async function toCard(read: ApprovalRead, digest: Sha256): Promise<CardRead> {
  const { approval } = read;
  if (approval.status !== "pending") return { ok: false, reason: "card.not_pending" };
  if (approval.companyId !== read.workspaceId) return { ok: false, reason: "card.wrong_workspace" };
  const created = read.activity.filter((entry) => entry.action === "approval.created");
  const createdEntry = created[0];
  if (created.length !== 1 || createdEntry === undefined || createdEntry.actorType === "system") {
    return { ok: false, reason: "card.no_created_entry" };
  }
  const payloadText = canonicalPayload(approval.payload);
  if (payloadText === undefined) return { ok: false, reason: "card.unreadable_payload" };

  const requester = { kind: createdEntry.actorType, id: createdEntry.actorId };
  const payloadHash = await contentDigest(payloadText, digest);
  const { sources } = read;
  const card: ApprovalCard = {
    approvalId: approval.id,
    workspaceId: read.workspaceId,
    kind: "untyped",
    untypedBecause: untypedReasons(approval, requester),
    approvalType: approval.type,
    approvalSource: sourceOf(approval.payload),
    target: { type: "none" },
    version: payloadHash,
    requester,
    linkedIssues: read.linkedIssues.map((issue) => issue.id),
    pathClasses: read.pathClasses,
    status: "pending",
    untouched: isUntouched(read),
    payloadHash,
    createdAt: approval.createdAt,
    sources: {
      approvalId: sources.approval,
      approvalType: sources.approval,
      status: sources.approval,
      payloadHash: sources.approval,
      requester: sources.activity,
      untouched: sources.activity,
      linkedIssues: sources.linkedIssues,
    },
  };
  return { ok: true, card, claims: claimsOf(read) };
}

function untypedReasons(
  approval: ApprovalRecord,
  requester: ApprovalCard["requester"],
): UntypedReason[] {
  const claimed = approval.requestedByAgentId;
  const matches = requester.kind === "agent" ? claimed === requester.id : claimed === null;
  return matches ? ["no_live_kinds"] : ["no_live_kinds", "requester_mismatch"];
}

/**
 * Once a person or an edit touches an approval it stays with people. Any
 * activity besides its creation counts, which fails closed for actions
 * Studio doesn't know.
 */
function isUntouched(read: ApprovalRead): boolean {
  const { approval } = read;
  return (
    approval.decidedByUserId === null &&
    approval.updatedAt === approval.createdAt &&
    read.activity.every((entry) => entry.action === "approval.created") &&
    read.comments.every((comment) => comment.authorType !== "user")
  );
}

/** Fields only a tool-gateway approval carries, so its shape gives it away without `source`. */
const toolGatewayFields = ["invocationId", "argumentsHash"];

function sourceOf(payload: unknown): ApprovalSource | "other" | null {
  if (typeof payload !== "object" || payload === null) return null;
  // A changed or missing `source` must not hide a tool-gateway call.
  if (toolGatewayFields.some((field) => field in payload)) return "tool_gateway";
  if (!("source" in payload)) return null;
  return isKnown(approvalSources, payload.source) ? payload.source : "other";
}

function canonicalPayload(payload: unknown): string | undefined {
  try {
    return canonicalJson(payload ?? null);
  } catch {
    // Not plain JSON data: there is nothing a card could pin.
    return undefined;
  }
}

/** Every text an agent could have written about this approval. */
function claimsOf(read: ApprovalRead): string[] {
  return [
    read.approval.type,
    ...stringsIn(read.approval.payload),
    ...read.comments.map((comment) => comment.body),
    ...read.linkedIssues.flatMap((issue) => [issue.title, issue.description ?? ""]),
  ];
}
