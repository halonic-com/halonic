import type { CliCommand, CliOption, CommandPath } from "./command.ts";
import { globalOptionFlags } from "./global-options.ts";
import type { Message } from "./messages/define.ts";
import { helpMessages } from "./messages/help.ts";
import { type Part, type Phrase, phrase, plainText } from "./messages/phrase.ts";

const blank: Phrase = [];

/** How wide a help line may be, for an 80-column terminal. */
const helpWidth = 80;

/**
 * The order `halonic --help` lists the commands in (cli-output 1.9): the order
 * people meet them, not their folders'. A command not named here goes last.
 */
export const commandOrder: readonly string[] = [
  "init",
  "validate",
  "test",
  "run",
  "runs",
  "routines",
  "serve",
  "trust",
  "plugin",
  "secret",
  "google",
  "tools",
  "extract",
  "doctor",
  "sandbox",
  "schema",
];

/** The help for `halonic` on its own (cli-output 1.9): what it is, the commands, the options, the exit codes. */
export function overallHelp(commands: readonly CliCommand[]): Phrase[] {
  return [
    helpMessages.tagline().phrase,
    blank,
    helpMessages.usage().phrase,
    blank,
    ...commandList(inHelpOrder(commands)),
    blank,
    ...globalOptionLines(globalOptionFlags),
    blank,
    helpMessages.exitCodes(0).phrase,
    helpMessages.exitCodes(1).phrase,
    helpMessages.exitCodes(2).phrase,
    helpMessages.exitCodes(3).phrase,
    blank,
    helpMessages.commandHelpHint().phrase,
  ];
}

/**
 * The help for one command: its usage line, its summary, its subcommands and
 * its options. A command with subcommands ends with where to find theirs.
 */
export function commandHelp(path: CommandPath): Phrase[] {
  const command = lastOf(path);
  const usageIndent =
    plainText(helpMessages.commandUsage(commandWords(path), "").phrase).length + 1;
  const lines = [
    ...wrapped(usageLine(path).phrase, usageIndent, true),
    blank,
    ...wrapped(command.summary.phrase, 0),
  ];
  const subcommands = command.subcommands ?? [];
  if (subcommands.length > 0) {
    lines.push(blank, ...commandList(subcommands));
  }
  const options = Object.entries(command.options).map(
    ([name, option]) => [optionLabel(name, option), option.description] as const,
  );
  if (options.length > 0) {
    const width = Math.max(...options.map(([label]) => label.length));
    lines.push(
      blank,
      helpMessages.optionsHeading().phrase,
      ...options.flatMap(([label, description]) =>
        wrapped(phrase`  ${label.padEnd(width)}  ${description.phrase}`, width + 4),
      ),
    );
  }
  if (subcommands.length > 0) {
    lines.push(blank, helpMessages.subcommandHelpHint(commandWords(path)).phrase);
  }
  return lines;
}

/** `Usage: halonic <words> <arguments>`, the fix line of a usage error. */
export function usageLine(path: CommandPath): Message {
  return helpMessages.commandUsage(commandWords(path), lastOf(path).usage);
}

/** The words that name a command after `halonic`, such as `runs show`. */
export function commandWords(path: CommandPath): string {
  return path.map((command) => command.name).join(" ");
}

/** The command that runs: the last word of the path. */
export function lastOf(path: CommandPath): CliCommand {
  return path[path.length - 1] ?? path[0];
}

/** The commands in {@link commandOrder}; the ones it doesn't name keep their order, at the end. */
function inHelpOrder(commands: readonly CliCommand[]): CliCommand[] {
  const rank = (command: CliCommand) => {
    const index = commandOrder.indexOf(command.name);
    return index === -1 ? commandOrder.length : index;
  };
  return [...commands].sort((a, b) => rank(a) - rank(b));
}

/** "Commands:" and one line per command with its summary, the names in one column. */
function commandList(commands: readonly CliCommand[]): Phrase[] {
  const width = Math.max(0, ...commands.map((command) => command.name.length));
  return [
    helpMessages.commandsHeading().phrase,
    ...commands.flatMap((command) =>
      wrapped(phrase`  ${command.name.padEnd(width)}  ${command.summary.phrase}`, width + 4),
    ),
  ];
}

/**
 * "Options for every command:" and the options, on as many lines as keep
 * each within {@link helpWidth}; every line but the last ends with a comma.
 */
function globalOptionLines(flags: readonly string[]): Phrase[] {
  const line = (index: number, group: readonly string[], continues: boolean) =>
    (index === 0 ? helpMessages.globalOptions : helpMessages.globalOptionsMore)(group, continues)
      .phrase;
  const groups: string[][] = [];
  for (const flag of flags) {
    const current = groups.at(-1);
    const longer = current === undefined ? [] : [...current, flag];
    if (
      current !== undefined &&
      plainText(line(groups.length - 1, longer, true)).length <= helpWidth
    ) {
      current.push(flag);
    } else {
      groups.push([flag]);
    }
  }
  return groups.map((group, index) => line(index, group, index < groups.length - 1));
}

/**
 * The line on as many lines as keep each within {@link helpWidth}, each further
 * line indented by `indent` so it starts under the column it continues (cli-output
 * 1.4 and 1.9). It breaks only at a space past `indent`, and with `together` never
 * inside `[…]` or `<…>`, so a usage line keeps each argument whole. A word longer
 * than the line stays whole, past 80 columns, rather than being cut.
 */
function wrapped(line: Phrase, indent: number, together = false): Phrase[] {
  const lines: Part[][] = [];
  let width = 0;
  for (const word of wordsOf(line, indent, together)) {
    const wordWidth = plainText(word).length;
    const current = lines.at(-1);
    if (current !== undefined && width + 1 + wordWidth <= helpWidth) {
      current.push(" ", ...word);
      width += 1 + wordWidth;
    } else if (current === undefined) {
      lines.push([...word]);
      width = wordWidth;
    } else {
      lines.push([" ".repeat(indent), ...word]);
      width = indent + wordWidth;
    }
  }
  return lines.length === 0 ? [blank] : lines;
}

/** The line's words for {@link wrapped}: its parts split at each space it may break at. */
function wordsOf(line: Phrase, indent: number, together: boolean): Part[][] {
  const split: Split = { words: [[]], column: 0, depth: 0, indent, together };
  for (const part of line) {
    const text = textOf(part);
    if (text === undefined) {
      split.words.at(-1)?.push(part);
      split.column += plainText([part]).length;
    } else {
      splitText(split, part, text);
    }
  }
  return split.words.filter((parts) => parts.length > 0);
}

/** Where {@link wordsOf} is in the line. */
interface Split {
  readonly words: Part[][];
  column: number;
  depth: number;
  readonly indent: number;
  readonly together: boolean;
}

/** The text of a plain or emphasised part; a mark or padding has none to split. */
function textOf(part: Part): string | undefined {
  if (typeof part === "string") return part;
  return "text" in part ? part.text : undefined;
}

/** Splits one text part at the spaces past the indent, outside `[…]` and `<…>` with `together`. */
function splitText(split: Split, part: Part, text: string): void {
  let piece = "";
  for (const char of text) {
    split.depth += split.together ? bracketStep(char) : 0;
    if (char === " " && split.column >= split.indent && split.depth === 0) {
      pushPiece(split.words, part, piece);
      piece = "";
      split.words.push([]);
    } else {
      piece += char;
    }
    split.column += 1;
  }
  pushPiece(split.words, part, piece);
}

/** How a character changes the depth inside `[…]` and `<…>`. */
function bracketStep(char: string): number {
  if (char === "[" || char === "<") return 1;
  if (char === "]" || char === ">") return -1;
  return 0;
}

/** Adds a piece of a text part to the last word, keeping the part's emphasis. */
function pushPiece(words: Part[][], part: Part, piece: string): void {
  if (piece !== "") {
    words
      .at(-1)
      ?.push(typeof part === "object" && "text" in part ? { ...part, text: piece } : piece);
  }
}

function optionLabel(name: string, option: CliOption): string {
  if (option.type === "boolean") {
    return `--${name}`;
  }
  return `--${name} <${option.valueName ?? "value"}>`;
}
