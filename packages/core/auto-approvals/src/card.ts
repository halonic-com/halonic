// The typed approval card (design section 2). Claims may only block; only facts
// may allow. A fact is written by the Paperclip server (status, who decided,
// timestamps, its own activity entries); a claim is anything an agent can write
// (the payload, the approval type, `requestedByAgentId`, issue titles and text).

import { canonicalJson, contentDigest, isPlainObject, type Sha256 } from "@halonicjs/std";
import type { ApprovalRead } from "./approval-read.ts";
import type { PathClass } from "./known-values.ts";

/** v1 ships no live kinds; each one is added by its own board card. */
export type ApprovalKind = "untyped";

/** Why a card is `untyped`. */
export type UntypedReason =
  | "card.no_live_kind"
  | "card.no_created_entry"
  | "card.requester_mismatch";

export type Target =
  | {
      readonly type: "github_pr";
      readonly repoId: number;
      readonly number: number;
      readonly baseRef: string;
      readonly headSha: string;
    }
  | {
      readonly type: "paperclip_issue_document";
      readonly issueId: string;
      readonly documentId: string;
      readonly revisionId: string;
    }
  | { readonly type: "none" };

export interface Requester {
  readonly kind: "agent" | "user";
  readonly id: string;
}

/** Where one fact on the card came from. */
export interface SourceRef {
  readonly system: "paperclip" | "github";
  readonly endpoint: string;
  readonly readAt: string;
}

/** What an agent wrote. These are only ever used to block. */
export interface CardClaims {
  readonly approvalType: string;
  readonly source: string | null;
  /** Every free text: payload keys and strings, comments, linked issue titles and descriptions. */
  readonly texts: readonly string[];
}

export interface ApprovalCard {
  readonly approvalId: string;
  readonly workspaceId: string;
  readonly kind: ApprovalKind;
  readonly untypedBecause: readonly UntypedReason[];
  readonly target: Target;
  /** The version a decision would pin. With no typed target in v1, the payload hash. */
  readonly version: string;
  /** The actor of the `approval.created` activity entry; `null` when there is none. */
  readonly requester: Requester | null;
  readonly linkedIssues: readonly string[];
  readonly pathClasses: readonly PathClass[];
  readonly status: "pending";
  /** No decision, revision request, resubmit, payload edit or user comment, ever. */
  readonly untouched: boolean;
  readonly payloadHash: string;
  readonly createdAt: string;
  readonly sources: Readonly<
    Record<"status" | "requester" | "untouched" | "linkedIssues", SourceRef>
  >;
  readonly claims: CardClaims;
}

export type CardRead =
  | { readonly ok: true; readonly card: ApprovalCard }
  | { readonly ok: false; readonly reason: "card.not_pending" | "card.wrong_workspace" };

/** Activity actions that mean a person has touched the approval. */
const touchingActions = ["approval.revision_requested", "approval.resubmitted"];

/**
 * Builds the card for one approval of workspace `workspaceId`. Only a pending
 * approval gets a card. Nothing on the card is taken from a claim except
 * `claims`, which the never-list scans to block.
 */
export async function toCard(
  read: ApprovalRead,
  workspaceId: string,
  digest: Sha256,
): Promise<CardRead> {
  const { approval } = read;
  if (approval.companyId !== workspaceId) return { ok: false, reason: "card.wrong_workspace" };
  if (approval.status !== "pending") return { ok: false, reason: "card.not_pending" };

  const payloadHash = await contentDigest(canonicalJson(approval.payload ?? null), digest);
  const requester = requesterOf(read);
  const source = (endpoint: string): SourceRef => ({
    system: "paperclip",
    endpoint,
    readAt: read.readAt,
  });
  return {
    ok: true,
    card: {
      approvalId: approval.id,
      workspaceId,
      kind: "untyped",
      untypedBecause: untypedReasons(read, requester),
      target: { type: "none" },
      version: payloadHash,
      requester,
      linkedIssues: read.linkedIssues.map((issue) => issue.id),
      pathClasses: [],
      status: "pending",
      untouched: isUntouched(read),
      payloadHash,
      createdAt: approval.createdAt,
      sources: {
        status: source(`/api/approvals/${approval.id}`),
        requester: source(`/api/companies/${workspaceId}/activity`),
        untouched: source(`/api/approvals/${approval.id}/comments`),
        linkedIssues: source(`/api/approvals/${approval.id}/issues`),
      },
      claims: claimsOf(read),
    },
  };
}

/** The actor of this approval's `approval.created` entry, the only fact about who asked. */
function requesterOf(read: ApprovalRead): Requester | null {
  const created = read.activity.find(
    (entry) => entry.action === "approval.created" && entry.entityId === read.approval.id,
  );
  if (created === undefined || created.actorType === "system") return null;
  return { kind: created.actorType, id: created.actorId };
}

function untypedReasons(read: ApprovalRead, requester: Requester | null): UntypedReason[] {
  const reasons: UntypedReason[] = ["card.no_live_kind"];
  if (requester === null) {
    reasons.push("card.no_created_entry");
  } else if (requester.kind !== "agent" || requester.id !== read.approval.requestedByAgentId) {
    reasons.push("card.requester_mismatch");
  }
  return reasons;
}

function isUntouched(read: ApprovalRead): boolean {
  const { approval } = read;
  return (
    approval.decidedByUserId === null &&
    approval.updatedAt === approval.createdAt &&
    !read.activity.some(
      (entry) => entry.entityId === approval.id && touchingActions.includes(entry.action),
    ) &&
    !read.comments.some((comment) => comment.authorUserId !== null)
  );
}

function claimsOf(read: ApprovalRead): CardClaims {
  const { payload } = read.approval;
  const source =
    isPlainObject(payload) && typeof payload["source"] === "string" ? payload["source"] : null;
  return {
    approvalType: read.approval.type,
    source,
    texts: [
      ...textsIn(payload),
      ...read.comments.map((comment) => comment.body),
      ...read.linkedIssues.flatMap((issue) => [issue.title, issue.description ?? ""]),
    ],
  };
}

/** Every key and string inside `value`, depth first. */
function textsIn(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(textsIn);
  if (isPlainObject(value))
    return Object.entries(value).flatMap(([key, item]) => [key, ...textsIn(item)]);
  return [];
}
