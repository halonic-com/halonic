import { amsterdamTime } from "../amsterdam-time.ts";
/**
 * Part (d) of the board check: approvals waiting for the board. Each pass
 * lists the pending approvals that weren't pending at the last pass, in one
 * comment on the Board Checker's task. It never decides one, and it names
 * only the id, the kind, who asked and when, never the payload.
 */

/** The approval fields the board check reads. */
export interface PendingApproval {
  readonly id: string;
  readonly type: string;
  readonly requestedByAgentId: string | null;
  readonly createdAt: Date | string;
}

/** What part (d) wants written this pass, and the ids to save once it went through. */
export interface ApprovalsPlan {
  readonly comment: string | undefined;
  readonly seen: readonly string[];
}

/**
 * Plans the comment for approvals pending now but not at the last pass.
 * The first pass (nothing saved yet) only notes what is pending. `seen`
 * keeps only the ones still pending, so it never grows.
 */
export function planApprovals(
  pending: readonly PendingApproval[],
  seenBefore: readonly string[] | undefined,
  names: ReadonlyMap<string, string>,
): ApprovalsPlan {
  const seen = pending.map((approval) => approval.id);
  if (seenBefore === undefined) {
    return { comment: undefined, seen };
  }
  const fresh = pending
    .filter((approval) => !seenBefore.includes(approval.id))
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  const lines = fresh.map((approval) => {
    const by =
      approval.requestedByAgentId === null
        ? "a board user"
        : (names.get(approval.requestedByAgentId) ?? approval.requestedByAgentId);
    return `- ${approval.id}: ${approval.type}, asked by ${by} at ${amsterdamTime(approval.createdAt)}`;
  });
  return {
    comment:
      lines.length === 0
        ? undefined
        : [
            `New pending approvals: ${lines.length}. Listed only; the board decides them.`,
            ...lines,
          ].join("\n"),
    seen,
  };
}

/** Reads the saved ids back; undefined when nothing was saved yet. */
export function readSeenApprovals(value: unknown): string[] | undefined {
  return Array.isArray(value)
    ? value.filter((id): id is string => typeof id === "string")
    : undefined;
}
