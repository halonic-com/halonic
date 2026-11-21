import type { RunFailureCause } from "./run-basics.ts";

/** The `code` of the cause a child run gets when it was cancelled because its parent ended (requirement `events.parent-ended`). */
export const parentEndedCode = "run.parent-ended";

/**
 * The typed cause of a child run the engine cancelled because the run that
 * started it ended. The parent is the run's own `parent`, so the cause names
 * nothing else.
 */
export const parentEndedCause: RunFailureCause = { kind: "conflict", code: parentEndedCode };

/**
 * Whether a failed run's cause says it was cancelled because the run that
 * started it ended. Any other cause, and no cause, as older logs have, is `false`.
 *
 * @example
 * endedWithParent(summary.cause); // true for a child its parent's end cancelled
 * endedWithParent(undefined); // false
 */
export function endedWithParent(cause: RunFailureCause | undefined): boolean {
  return cause?.code === parentEndedCode;
}
