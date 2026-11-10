import { defineMessages } from "./define.ts";
import { type Phrase, phrase } from "./phrase.ts";

/**
 * The frame of a yes-or-no question (cli-output 1.7). The question itself
 * comes from the command, such as "Trust Acme on this computer?".
 */
export const questionMessages = defineMessages("question", {
  /** "Trust Acme on this computer? [y/N] ": No, the careful answer, is the default. */
  yesNo: (question: Phrase) => phrase`${question} [y/N] `,
});
