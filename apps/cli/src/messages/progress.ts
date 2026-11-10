import { defineMessages } from "./define.ts";
import { dim, markPart, type Phrase, phrase } from "./phrase.ts";

/**
 * How long a wait has lasted, as the live line says it (cli-output 1.5): "12 s"
 * under a minute, then "5 min 47 s", or "6 min" when the seconds are 0.
 */
export function waitTime(seconds: number): string {
  if (seconds < 60) {
    return `${seconds} s`;
  }
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest === 0 ? `${minutes} min` : `${minutes} min ${rest} s`;
}

/**
 * The live line of a step that takes a while (cli-output 1.5). The step's own
 * words, in the present tense, come from the command, such as "Draft reply";
 * these are only the frame around them.
 */
export const progressMessages = defineMessages("progress", {
  /** "◌ Draft reply", from 1 second in. */
  doing: (doing: Phrase) => phrase`${markPart("working")} ${doing}`,
  /**
   * "◌ Draft reply · waiting for Anthropic (12 s)", after 10 seconds without
   * news; from a minute on, "(5 min 47 s)".
   */
  waiting: (doing: Phrase, what: string, seconds: number) =>
    phrase`${markPart("working")} ${doing} ${markPart("separator")} waiting for ${what} ${dim(`(${waitTime(seconds)})`)}`,
});
