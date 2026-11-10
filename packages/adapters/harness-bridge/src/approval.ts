import { randomUUID } from "node:crypto";
import type { BridgeApprovals } from "@halonicjs/ports";

/**
 * What became of a question for a person's OK. `unanswered`: the wait ended
 * without a decision, because the run ended, the program went away or the
 * question was withdrawn.
 */
export type ApprovalAnswer =
  | { kind: "approved" }
  | { kind: "rejected"; comment?: string }
  | { kind: "unanswered" };

/** One call to ask a person about: a Halonic tool, or one of the program's own, such as "Bash". */
export interface ApprovalQuestion {
  tool: string;
  args: unknown;
}

/**
 * Asks a person for an OK through the run's approvals and waits for the
 * answer (requirement `harness-bridge.approvals`). The engine writes
 * `approval.requested` and `approval.resolved`; the bridge only makes up the
 * call id, unique in the run, and turns the outcome into an answer the
 * program can act on. It never throws: a wait that ends without a decision
 * is `unanswered`, whatever ended it, so its reason can't reach the program.
 */
export async function askForApproval(
  approvals: BridgeApprovals,
  question: ApprovalQuestion,
  signal: AbortSignal,
): Promise<ApprovalAnswer> {
  const callId = `bridge-${randomUUID()}`;
  try {
    const decision = await approvals.request({ callId, ...question }, { signal });
    if (decision.approved) return { kind: "approved" };
    return decision.comment === undefined
      ? { kind: "rejected" }
      : { kind: "rejected", comment: decision.comment };
  } catch {
    return { kind: "unanswered" };
  }
}

/**
 * Why a call didn't run, as the program reads it, in the built-in loop's
 * words: a person rejected it, and what they wrote, if anything.
 */
export function refusalReason(answer: Exclude<ApprovalAnswer, { kind: "approved" }>): string {
  if (answer.kind === "unanswered") return "the wait for a person's OK ended without an answer";
  return answer.comment === undefined || answer.comment === ""
    ? "a person rejected the call"
    : `a person rejected the call and wrote: ${answer.comment}`;
}
