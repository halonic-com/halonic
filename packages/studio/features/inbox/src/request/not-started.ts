import { type EngineWords, startFailureOf } from "@halonicjs/studio-shell";
import { BudgetUsedUp } from "./inbox-requests.ts";

/** What the line under the request form says when a request didn't start. */
export interface NotStarted {
  /** "Not started: *reason*." */
  readonly line: string;
  /** Whether the line offers **Copy details** (22 F13). */
  readonly copyDetails: boolean;
}

/**
 * The line under the request form when a request didn't start (microcopy 10.3): "Not started:
 * *reason*." The reason is the shell's `startFailureOf`, as the Run panel and the run page's **Run
 * again** say it (UX check S6, HAL-12390): lower case after the colon unless it starts with a name
 * such as "Gmail", and a failure Halonic can't explain says so, with **Copy details**. The budget's
 * refusal keeps its own words, with **Change budget** after the line.
 */
export function notStartedOf(error: unknown, words: EngineWords): NotStarted {
  if (error instanceof BudgetUsedUp) {
    const reason = `${error.message.charAt(0).toLowerCase()}${error.message.slice(1)}`;
    return { line: `Not started: ${reason}`, copyDetails: false };
  }
  const failure = startFailureOf(error, words.notAnswering);
  return { line: `Not started: ${failure.reason}`, copyDetails: failure.copyDetails };
}
