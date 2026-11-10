import { defineMessages } from "./define.ts";
import { duration } from "./duration.ts";
import { dim, markPart, type Phrase, phrase } from "./phrase.ts";

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
    phrase`${markPart("working")} ${doing} ${markPart("separator")} waiting for ${what} ${dim(`(${duration(seconds * 1_000)})`)}`,
});
