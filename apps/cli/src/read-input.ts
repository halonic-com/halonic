import { parseArgs } from "node:util";
import { type CliCommand, type CommandInput, UsageError } from "./command.ts";
import { globalOptionSpellings } from "./global-options.ts";
import { usageMessages } from "./messages/general.ts";
import { nearMatch } from "./near-match.ts";

/**
 * Reads the arguments after the command name against the command's options.
 * The global options are already taken out (`readGlobalOptions`).
 *
 * @throws UsageError for an unknown option (with "Did you mean" when one is
 *   close), a string option without its value, or a value given to a switch
 */
export function readInput(command: CliCommand, args: readonly string[]): CommandInput {
  const options = Object.fromEntries(
    Object.entries(command.options).map(([name, option]) => [
      name,
      { type: option.type, multiple: option.multiple ?? false },
    ]),
  );
  // Not strict, so the problems come back as tokens we word ourselves:
  // node:util's own messages are a library's text, which never reaches the user.
  const parsed = parseArgs({
    args: [...args],
    options,
    allowPositionals: true,
    strict: false,
    tokens: true,
  });
  for (const token of parsed.tokens) {
    if (token.kind === "option") {
      checkOption(command, token.name, token.rawName, token.value);
    }
  }
  return { positionals: parsed.positionals, options: parsed.values };
}

function checkOption(
  command: CliCommand,
  name: string,
  rawName: string,
  value: string | undefined,
): void {
  const option = Object.hasOwn(command.options, name) ? command.options[name] : undefined;
  if (option === undefined) {
    const known = [
      ...Object.keys(command.options).map((known) => `--${known}`),
      ...globalOptionSpellings,
    ];
    const near = nearMatch(rawName, known);
    throw new UsageError(
      near === undefined
        ? usageMessages.unknownOption(rawName)
        : usageMessages.unknownOptionNear(rawName, near),
      usageMessages.seeCommandOptions(command.name),
    );
  }
  if (option.type === "string" && value === undefined) {
    throw new UsageError(usageMessages.missingValue(rawName, option.valueName ?? "value"));
  }
  if (option.type === "boolean" && value !== undefined) {
    throw new UsageError(usageMessages.noValueWanted(rawName, `${rawName}=${value}`));
  }
}
