import { defineMessages } from "./define.ts";
import { markPart, type Phrase, phrase } from "./phrase.ts";

/** The words of `halonic --help` and `halonic <command> --help` (cli-output 1.9). */
export const helpMessages = defineMessages("help", {
  tagline: () => phrase`Run and check Halonic workspaces from the command line.`,
  usage: () => phrase`Usage: halonic <command> [arguments]`,
  commandsHeading: () => phrase`Commands:`,
  /** The first line of the options; `continues` ends it with a comma when the list goes on. */
  globalOptions: (options: readonly string[], continues: boolean) =>
    phrase`Options for every command: ${options.join(", ")}${continues ? "," : ""}`,
  /** A further line of the options, when the first would pass 80 columns. */
  globalOptionsMore: (options: readonly string[], continues: boolean) =>
    phrase`${options.join(", ")}${continues ? "," : ""}`,
  /** What `halonic --version` prints: "halonic 0.1.0". */
  version: (version: string) => phrase`halonic ${version}`,
  /** The exit codes, on four lines as the design sets them, so each fits an 80-column terminal. */
  exitCodes: (line: ExitCodeLine) => exitCodeLine(line),
  commandHelpHint: () =>
    phrase`Run halonic <command> --help for a command's arguments and options.`,
  /** The last line of the help of a command with subcommands, such as `halonic runs --help`. */
  subcommandHelpHint: (command: string) =>
    phrase`Run halonic ${command} <command> --help for a command's arguments and options.`,
  commandUsage: (command: string, usage: string) =>
    phrase`Usage: halonic ${command}${usage === "" ? "" : ` ${usage}`}`,
  optionsHeading: () => phrase`Options:`,
});

const exitCodeMeanings: readonly (readonly string[])[] = [
  ["0 worked", "1 failed or found errors", "2 wrong usage or input"],
  ["3 not trusted", "4 not found", "5 conflict", "6 signed out", "7 not allowed"],
  ["8 limit reached", "9 didn't answer or the sandbox can't start"],
  ["130 or 143 stopped"],
];

/** Which of the help's exit-code lines, from the first. */
export type ExitCodeLine = 0 | 1 | 2 | 3;

/** One line of exit codes, joined by the · mark, with a trailing · when more lines follow. */
function exitCodeLine(line: ExitCodeLine): Phrase {
  const separator = markPart("separator");
  const meanings = exitCodeMeanings[line] ?? [];
  const joined = meanings.flatMap((meaning, index) =>
    index === 0 ? [meaning] : [" ", separator, " ", meaning],
  );
  const lead = line === 0 ? "Exit codes: " : "";
  const trail = line < exitCodeMeanings.length - 1 ? [" ", separator] : [];
  return phrase`${lead}${[...joined, ...trail]}`;
}
