import type { CheckContext } from "../lib/context.ts";

/** One change the guard found that needs a decision note (plan 9.3). */
export interface GuardFinding {
  /** What the note must list under Covers: a requirement ID or a repo path. */
  readonly subject: string;
  /** Where to point the finding. */
  readonly file: string;
  readonly line?: number;
  readonly message: string;
}

/** The two checkouts the guard compares: the merge base and the pull request. */
export interface Checkouts {
  readonly base: CheckContext;
  readonly head: CheckContext;
}

/** One of the guard's checks. */
export type GuardCheck = (checkouts: Checkouts) => GuardFinding[];
