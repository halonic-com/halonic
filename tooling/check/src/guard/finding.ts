import type { CheckContext } from "../lib/context.ts";

/** One change the guard found that needs a decision note (plan 9.3). */
export interface GuardFinding {
  /**
   * What the note must list under Covers: a requirement ID or a repo path.
   * `undefined` when no note can allow it, such as a missing result file.
   */
  readonly subject: string | undefined;
  /** Where to point the finding. */
  readonly file: string;
  readonly line?: number;
  readonly message: string;
}

/** The two checkouts the guard compares: the merge base and the pull request. */
export interface Checkouts {
  readonly base: CheckContext;
  readonly head: CheckContext;
  /**
   * The checkout whose test results are the baseline, when it isn't the
   * merge base: CI walks back to an older main commit when the merge base's
   * tests fail (HAL-7633). Only the test-runs check reads it.
   */
  readonly testBase?: CheckContext;
}

/** How a file differs between the checkouts: "added", "deleted", "changed" or not at all. */
export function changeOf(file: string, base: CheckContext, head: CheckContext): string | undefined {
  const inBase = base.files.includes(file);
  const inHead = head.files.includes(file);
  if (!inBase) {
    return "added";
  }
  if (!inHead) {
    return "deleted";
  }
  return base.read(file) === head.read(file) ? undefined : "changed";
}

/** One of the guard's checks. */
export type GuardCheck = (checkouts: Checkouts) => GuardFinding[];
