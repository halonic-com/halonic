import type { SecretsFileUnreadableFailure } from "@halonicjs/app/run-failure";
import { shellWord } from "@halonicjs/std";

// The banner's words for a run the profile's secrets file stopped because the person's user
// account can't read it (HAL-15693): the CLI's line 1 and the fix `halonic secret list` gives
// for the same file, as one sentence, as the file other users can read has (F24).

/**
 * The command that fixes the file, to type or paste into a terminal, or `undefined` on Windows,
 * which fixes it in the file's Properties. A file another user owns is given back to the person
 * first. The path is written for a shell (`std.shell-word`). The sentence shows this same command.
 */
function unreadableSecretsFileCommand(failure: SecretsFileUnreadableFailure): string | undefined {
  const word = shellWord(failure.file);
  switch (failure.fix) {
    case "chmod":
      return `chmod 600 ${word}`;
    case "chown":
      return `sudo chown "$(id -un)" ${word} && chmod 600 ${word}`;
    case "properties":
      return undefined;
  }
}

/** The fix's sentence: run the command in a terminal, or on the computer from a phone. */
function fixSentence(failure: SecretsFileUnreadableFailure, phone: boolean): string {
  const command = unreadableSecretsFileCommand(failure);
  if (command === undefined) {
    const where = phone ? "On your computer, give" : "Give";
    return `${where} your user account access to it in the file's Properties, under Security, then run again.`;
  }
  const owner = failure.fix === "chown" ? "It belongs to another user. " : "";
  return `${owner}Run ${command} ${phone ? "on your computer" : "in a terminal"}, then run again.`;
}

/** The words of the banner for a secrets file the person's user account can't read. */
export const secretsFileWords = {
  /** The banner's one line: where the run stopped, the cause, then the fix (F24's shape). */
  unreadable: (
    workflow: string,
    step: string,
    failure: SecretsFileUnreadableFailure,
    phone: boolean,
  ) =>
    `${workflow} stopped in the step ${step}: the secrets file ${failure.file} can't be read by your user account. ${fixSentence(failure, phone)}`,
  /** The command Copy command copies, or `undefined` when there is none to run (Windows). */
  unreadableCommand: unreadableSecretsFileCommand,
};
