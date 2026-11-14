import { defineMessages } from "./define.ts";
import { type Phrase, phrase } from "./phrase.ts";

/**
 * The frame of a question: yes-or-no (cli-output 1.7) or a hidden answer. The
 * question itself comes from the command, such as "Trust Acme on this computer?".
 */
export const questionMessages = defineMessages("question", {
  /** "Trust Acme on this computer? [y/N] ": No, the careful answer, is the default. */
  yesNo: (question: Phrase) => phrase`${question} [y/N] `,
  /** "Password for serve: ": what is typed after it isn't shown. */
  secret: (prompt: Phrase) => phrase`${prompt}: `,
});
