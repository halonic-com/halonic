import { parseArgs } from "node:util";
import { type CliCommand, type CommandInput, UsageError } from "./command.ts";

/**
 * Reads the arguments after the command name against the command's options.
 *
 * @throws UsageError for an unknown option or an option without its value
 */
export function readInput(command: CliCommand, args: readonly string[]): CommandInput {
  const options = Object.fromEntries(
    Object.entries(command.options).map(([name, option]) => [
      name,
      { type: option.type, multiple: option.multiple ?? false },
    ]),
  );
  try {
    const parsed = parseArgs({ args: [...args], options, allowPositionals: true, strict: true });
    return { positionals: parsed.positionals, options: parsed.values };
  } catch (error) {
    // node:util names the bad option in its message; we keep the text and make it a usage error.
    throw new UsageError(error instanceof Error ? error.message : String(error));
  }
}
