/*
 * Tool approvals. A task state whose agent calls a tool that needs approval
 * pauses the run (status "waiting") until one of the approval events arrives:
 * "approve" runs the call, "reject" tells the agent it was refused. Either
 * way the agent continues where it stopped, then the workflow moves on as
 * usual. A "reject" with a comment (`{ comment }` as its payload) asks for
 * changes instead: the agent gets the comment and may call the tool again,
 * and the new call needs approval too.
 *
 * The texts below are what the agent reads, so they are kept word for word
 * from the old engine: a change would change how agents behave.
 */

/** The events that answer a paused tool call: run it, or refuse it. */
export const APPROVAL_EVENTS = ["approve", "reject"] as const;

/**
 * What an event decides about a paused tool call.
 *
 * @returns `true` for `"approve"`, `false` for `"reject"` and `null` for any
 * other event, which is not an approval
 *
 * @example
 * approvalDecision("approve"); // true
 * approvalDecision("done"); // null
 */
export function approvalDecision(event: string): boolean | null {
  if (event === "approve") {
    return true;
  }
  if (event === "reject") {
    return false;
  }
  return null;
}

/** What the agent is told, as the tool's result, when a person rejects its call. */
export const REJECTED_TOOL_RESULT =
  "A person rejected this tool call. Do not try it again; continue without it.";

/**
 * The comment in the payload of a "reject" that asks for changes.
 *
 * @returns the comment without the spaces around it, or `null` when the
 * payload is not an object, has no `comment` text, or the comment is blank
 *
 * @example
 * approvalComment({ comment: " Use the formal tone. " }); // "Use the formal tone."
 * approvalComment({ comment: "  " }); // null
 * approvalComment(undefined); // null
 */
export function approvalComment(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const { comment } = payload as { comment?: unknown };
  if (typeof comment !== "string") {
    return null;
  }
  const trimmed = comment.trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * What the agent is told, as the tool's result, when a person asks for
 * changes to its call.
 *
 * @param comment - the person's comment, as {@link approvalComment} gives it
 */
export function revisedToolResult(comment: string): string {
  return `A person did not approve this tool call yet and asks for changes: "${comment}". Change only what they asked, then call the tool again; the new call needs their approval too.`;
}
