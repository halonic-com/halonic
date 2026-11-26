// What Studio read from Paperclip about one board approval, in the shapes the
// card needs. The Paperclip client fills these in with GETs only; this package
// never reads anything itself.

/** A board approval as Paperclip returns it. */
export interface ApprovalRecord {
  readonly id: string;
  readonly companyId: string;
  /** A claim: the requesting agent chose it. */
  readonly type: string;
  readonly status: string;
  /** A claim: an agent can set it to another agent (P1). */
  readonly requestedByAgentId: string | null;
  readonly decidedByUserId: string | null;
  /** A claim: anything the requesting agent wrote. */
  readonly payload: unknown;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** One activity entry about the approval, written by Paperclip's own routes. */
export interface ActivityEntry {
  readonly action: string;
  readonly actorType: "agent" | "user" | "system";
  readonly actorId: string;
  readonly entityId: string;
  readonly createdAt: string;
}

/** A comment on the approval. */
export interface ApprovalComment {
  readonly authorAgentId: string | null;
  readonly authorUserId: string | null;
  readonly body: string;
}

/** An issue linked to the approval. Its title and description are claims. */
export interface LinkedIssue {
  readonly id: string;
  readonly title: string;
  readonly description: string | null;
}

/** Everything read about one approval, and when the server said it was read. */
export interface ApprovalRead {
  readonly approval: ApprovalRecord;
  readonly activity: readonly ActivityEntry[];
  readonly comments: readonly ApprovalComment[];
  readonly linkedIssues: readonly LinkedIssue[];
  /** The `Date` header of the response, never the local clock. */
  readonly readAt: string;
}
