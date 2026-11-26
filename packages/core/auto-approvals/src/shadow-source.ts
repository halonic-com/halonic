// The one Paperclip dependency of the shadow runner: a port that can only
// read (threat model rev 2, G1). Nothing here can approve, comment or write
// a document, so the runner can't either.

import type { ActivityEntry, ApprovalComment, ApprovalRecord, LinkedIssue } from "./card.ts";
import type { PinnedDocument } from "./pinned-documents.ts";

/** Everything read about one approval, before it becomes a card. */
export interface ShadowApprovalRead {
  readonly approval: ApprovalRecord;
  readonly activity: readonly ActivityEntry[];
  readonly comments: readonly ApprovalComment[];
  readonly linkedIssues: readonly LinkedIssue[];
}

/** What the source's own transport did, for the daily digest (G4). */
export interface ShadowCallCounts {
  /** Requests that went to Paperclip, every one a GET on the shadow list. */
  readonly sent: number;
  /** Attempts refused before anything was sent. Must stay 0. */
  readonly refused: number;
  /** Of those, the attempts with a method other than GET. Must stay 0. */
  readonly refusedNotGet: number;
  /** Requests other than GET that got past the guard to the network, counted below it. Must stay 0. */
  readonly writesSent: number;
}

/**
 * The read-only Paperclip source. Every method throws when a read fails; the
 * error may carry a `shadowReason` such as `read.status`, which the runner
 * records. Reads run one at a time: the runner never starts a second before
 * the first is done.
 */
export interface ShadowSource {
  /** The company's pending approvals. */
  pendingApprovals(): Promise<readonly ApprovalRecord[]>;
  /** One approval with its activity, comments and linked issues. */
  approval(approvalId: string): Promise<ShadowApprovalRead>;
  /** The never-list and the stop document on the pinned issue, with every revision. */
  pinnedDocuments(issueId: string): Promise<{ neverList: PinnedDocument; stop: PinnedDocument }>;
  /** The server's time from the newest answer's `Date` header, or `undefined` without one. */
  serverTime(): Date | undefined;
  /** The calls made and refused so far. */
  counts(): ShadowCallCounts;
}

/** A read reason is `read.` and a lower-case code; anything else is reported as `read.failed`. */
const readReasonPattern = /^read\.[a-z_]{1,40}$/;

/**
 * The reason code a failed read gives, never its message: the message may
 * echo an address or a header.
 *
 * @param error - what a {@link ShadowSource} method threw
 */
export function readReasonOf(error: unknown): string {
  if (typeof error === "object" && error !== null && "shadowReason" in error) {
    const reason = error.shadowReason;
    if (typeof reason === "string" && readReasonPattern.test(reason)) return reason;
  }
  return "read.failed";
}
