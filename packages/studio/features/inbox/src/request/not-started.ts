import { type EngineWords, startFailureOf, withFullStop } from "@halonicjs/studio-shell";
import { BudgetUsedUp } from "./inbox-requests.ts";

/** What the line under the request form says when a request didn't start. */
export interface NotStarted {
  /** "Not started: *reason*", then the next step when there is one. */
  readonly line: string;
  /** The command the next step leads to, for a CommandBox under the line; `undefined` for none. */
  readonly command: string | undefined;
  /** Whether the line offers **Copy details** (22 F13). */
  readonly copyDetails: boolean;
}

/**
 * The line under the request form when a request didn't start (microcopy 10.3): "Not started:
 * *reason*", then the refusal's next step, with the command it leads to under the line. The reason,
 * step and command are the shell's `startFailureOf`, as the Run panel and the run page's **Run
 * again** say them (UX check S6 and rule E4, HAL-12390; design check C533-2): lower case after the
 * colon unless it starts with a name such as "Gmail", and a failure Halonic can't explain says so,
 * with **Copy details**. There is no **Try again**: **Send** is right there and the message is
 * kept. The budget's refusal keeps its own words, with **Change budget** after the line.
 *
 * @example
 * notStartedOf(lockHeldElsewhere, words).line;
 * // "Not started: Acme is already running in another Halonic on this computer (process 4321).
 * //  Stop that one, then try again."
 */
export function notStartedOf(error: unknown, words: EngineWords): NotStarted {
  if (error instanceof BudgetUsedUp) {
    const reason = `${error.message.charAt(0).toLowerCase()}${error.message.slice(1)}`;
    return { line: `Not started: ${reason}`, command: undefined, copyDetails: false };
  }
  const failure = startFailureOf(error, words.notAnswering);
  const step = failure.fix === undefined ? "" : ` ${withFullStop(failure.fix)}`;
  return {
    line: `Not started: ${failure.reason}${step}`,
    command: failure.command,
    copyDetails: failure.copyDetails,
  };
}
