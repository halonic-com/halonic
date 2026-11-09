import type { CliCommand, CliOption } from "./command.ts";
import { globalOptionFlags } from "./global-options.ts";
import type { Message } from "./messages/define.ts";
import { helpMessages } from "./messages/help.ts";
import { type Phrase, phrase } from "./messages/phrase.ts";

const blank: Phrase = [];

/** The help for `halonic` on its own (cli-output 1.9): what it is, the commands, the options, the exit codes. */
export function overallHelp(commands: readonly CliCommand[]): Phrase[] {
  const width = Math.max(0, ...commands.map((command) => command.name.length));
  return [
    helpMessages.tagline().phrase,
    blank,
    helpMessages.usage().phrase,
    blank,
    helpMessages.commandsHeading().phrase,
    ...commands.map(
      (command) => phrase`  ${command.name.padEnd(width)}  ${command.summary.phrase}`,
    ),
    blank,
    helpMessages.globalOptions(globalOptionFlags).phrase,
    blank,
    helpMessages.exitCodes(0).phrase,
    helpMessages.exitCodes(1).phrase,
    helpMessages.exitCodes(2).phrase,
    helpMessages.exitCodes(3).phrase,
    blank,
    helpMessages.commandHelpHint().phrase,
  ];
}

/** The help for one command: its usage line, its summary and its options. */
export function commandHelp(command: CliCommand): Phrase[] {
  const lines = [usageLine(command).phrase, blank, command.summary.phrase];
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
  return lines;
}

/** `Usage: halonic <name> <arguments>`, the fix line of a usage error. */
export function usageLine(command: CliCommand): Message {
  return helpMessages.commandUsage(command.name, command.usage);
}

function optionLabel(name: string, option: CliOption): string {
  if (option.type === "boolean") {
    return `--${name}`;
  }
  return `--${name} <${option.valueName ?? "value"}>`;
}
