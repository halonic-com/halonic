import type { CliCommand, CliOption, CommandPath } from "./command.ts";
import { globalOptionFlags } from "./global-options.ts";
import type { Message } from "./messages/define.ts";
import { helpMessages } from "./messages/help.ts";
import { type Phrase, phrase, plainText } from "./messages/phrase.ts";

const blank: Phrase = [];

/** How wide a help line may be, for an 80-column terminal. */
const helpWidth = 80;

/** The help for `halonic` on its own (cli-output 1.9): what it is, the commands, the options, the exit codes. */
export function overallHelp(commands: readonly CliCommand[]): Phrase[] {
  return [
    helpMessages.tagline().phrase,
    blank,
    helpMessages.usage().phrase,
    blank,
    ...commandList(commands),
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
  const lines = [usageLine(path).phrase, blank, command.summary.phrase];
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
      ...options.map(
        ([label, description]) => phrase`  ${label.padEnd(width)}  ${description.phrase}`,
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

/** "Commands:" and one line per command with its summary, the names in one column. */
function commandList(commands: readonly CliCommand[]): Phrase[] {
  const width = Math.max(0, ...commands.map((command) => command.name.length));
  return [
    helpMessages.commandsHeading().phrase,
    ...commands.map(
      (command) => phrase`  ${command.name.padEnd(width)}  ${command.summary.phrase}`,
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

function optionLabel(name: string, option: CliOption): string {
  if (option.type === "boolean") {
    return `--${name}`;
  }
  return `--${name} <${option.valueName ?? "value"}>`;
}
