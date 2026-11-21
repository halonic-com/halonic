import { errorKindOf } from "@halonicjs/std";
import { EngineNotAnswering } from "../engine/engine-not-answering.ts";
import { rawDetailsOf } from "./copy-details-words.ts";
import { errorReasonFor } from "./error-message.ts";
import { lowerAfterColon } from "./failure-line.ts";

/**
 * What a run that didn't start shows, wherever it was started: the Run panel's **Start run**, the
 * run page's **Run again** and the Inbox's request form (UX check S1, S2, S4 and S6, HAL-12390).
 * Each screen puts its own lead before the reason ("Couldn't start the run:", "Not started:").
 */
export interface StartFailure {
  /** The reason as it reads after the lead's colon, with its full stop (rule E5). */
  readonly reason: string;
  /** The next step, a sentence on its own line; `undefined` when there is none. */
  readonly fix: string | undefined;
  /** The command the next step leads to, for a CommandBox (rule N2, HAL-12363). */
  readonly command: string | undefined;
  /** Whether starting again may help, so the screen offers **Try again**. */
  readonly tryAgain: boolean;
  /** Whether the screen offers **Copy details**: the failure has raw text, or no reason it can show (22 F13). */
  readonly copyDetails: boolean;
}

/**
 * The {@link StartFailure} of what a start rejected with:
 *
 * - An engine that can't be reached says so in the words for where Studio runs, with **Try again**.
 * - A failure Halonic can't explain (`internal`, or no reason) says "Halonic ran into a problem it
 *   can't explain yet." with **Copy details** only: starting again the same way won't help.
 * - A refusal with a next step shows the step, and its command when it has one, without **Try
 *   again** (D7). A `conflict` keeps **Try again** next to its step: the other Halonic may have
 *   finished by the time the person reads it (UX check S1, design check C471-6).
 * - Any other reason gets **Try again**; one that replaces raw text gets **Copy details** too.
 *
 * `notAnswering` is the reason for an engine that can't be reached, in the words for where Studio
 * runs (`EngineWords.notAnswering`).
 *
 * @example
 * startFailureOf(new EngineNotAnswering(), engineWords.served.notAnswering).reason;
 * // "Halonic on the server isn't answering."
 */
export function startFailureOf(error: unknown, notAnswering: string): StartFailure {
  if (error instanceof EngineNotAnswering) {
    return { ...noStep, reason: lowerAfterColon(notAnswering), tryAgain: true, copyDetails: false };
  }
  const reason = errorReasonFor(error, "");
  if (reason === "") {
    return { ...noStep, reason: errorReasonFor(error), tryAgain: false, copyDetails: true };
  }
  const fix = fixOf(error);
  return {
    reason: withFullStop(lowerAfterColon(reason)),
    fix,
    command: fix === undefined ? undefined : commandOf(error),
    tryAgain: fix === undefined || errorKindOf(error) === "conflict",
    copyDetails: rawDetailsOf(error) !== undefined,
  };
}

const noStep = { fix: undefined, command: undefined } as const;

/** The next step a kinded error carries (`fix`), when it has one. */
function fixOf(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("fix" in error)) return undefined;
  return typeof error.fix === "string" && error.fix.trim() !== "" ? error.fix : undefined;
}

/** The command a refusal carries for a terminal (`command`), when it has one. */
function commandOf(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("command" in error)) return undefined;
  return typeof error.command === "string" && error.command !== "" ? error.command : undefined;
}

/** The sentence as it ends, or with a full stop; a line that leads to a command keeps its colon. */
export function withFullStop(sentence: string): string {
  return /[.!?:]$/.test(sentence) ? sentence : `${sentence}.`;
}
