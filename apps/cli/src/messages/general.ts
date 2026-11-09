import { defineMessages } from "./define.ts";
import { dim, type Phrase, type PhraseValue, phrase } from "./phrase.ts";

/** Where a bug is reported; the `internal` fix line links to it. */
export const issuesLink = "https://github.com/halonic-com/halonic/issues";

/**
 * The sentences of the error shape (cli-output 1.3 and section 4). Line 1 is
 * built from the command's action and the error's own message, line 2 is the
 * error's own fix, so the only words here are the frame around them and the
 * lines of a bug, whose own text is never shown.
 */
export const errorMessages = defineMessages("error", {
  /** Line 1 when the command knows what it was doing: "Couldn't run support-reply: …". */
  couldnt: (action: Phrase, reason: PhraseValue) => phrase`Couldn't ${action}: ${reason}`,
  /** Line 1 of a bug, instead of its own text. */
  internal: () => phrase`Halonic ran into a problem it can't explain yet.`,
  /** Line 2 of a bug: the approved step (F16, microcopy L4), with `--debug` from HAL-2147. */
  internalFix: () =>
    phrase`Run it again with --debug to see the details, and report it: ${issuesLink}`,
  /** With `--debug`, the first line of each error a bug wraps, after its own stack. */
  causedBy: (text: string) => phrase`Caused by: ${text}`,
  /** Optional line 3, dimmed as a whole: the docs page and the detailed code, for searching and bug reports. */
  more: (link: string, code?: string) => [
    dim(code === undefined ? `More: ${link}` : `More: ${link} (${code})`),
  ],
});

/** The sentences for a wrong command line (cli-output 1.3, "Wrong usage"). */
export const usageMessages = defineMessages("usage", {
  unknownCommand: (name: string) => phrase`There's no command "${name}".`,
  unknownCommandNear: (name: string, near: string) =>
    phrase`There's no command "${name}". Did you mean ${near}?`,
  seeEveryCommand: () => phrase`Run halonic --help to see every command.`,
  unknownOption: (option: string) => phrase`There's no option ${option}.`,
  unknownOptionNear: (option: string, near: string) =>
    phrase`There's no option ${option}. Did you mean ${near}?`,
  seeCommandOptions: (command: string) => phrase`Run halonic ${command} --help to see its options.`,
  missingValue: (option: string, valueName: string) =>
    phrase`${option} needs a value: ${option} <${valueName}>.`,
  /** "--json doesn't take a value, and you gave one: --json=yes.", the shape of L6. */
  noValueWanted: (option: string, given: string) =>
    phrase`${option} doesn't take a value, and you gave one: ${given}.`,
});
