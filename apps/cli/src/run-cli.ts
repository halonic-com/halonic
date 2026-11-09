import type { Secrets } from "@halonicjs/ports";
import { errorKindOf, SecretScrubber } from "@halonicjs/std";
import { closestName } from "./closest-name.ts";
import { type CliCommand, type CliIo, type CommandContext, UsageError } from "./command.ts";
import { type ExitCode, exitCode } from "./exit-code.ts";
import { exitCodeFor } from "./exit-code-for.ts";
import { helpFlags, readGlobalOptions } from "./global-options.ts";
import { commandHelp, overallHelp, usageLine } from "./help.ts";
import { type PrintErrorContext, printError } from "./print-error.ts";
import { readInput } from "./read-input.ts";
import { noSecrets, rememberedSecrets } from "./remembered-secrets.ts";

/**
 * Runs one `halonic` command line and returns the exit code. Output goes
 * through `io`, so tests run the CLI in-process and read what it printed.
 *
 * @param args - the command line after `halonic`, with global options such
 *   as `--debug` anywhere in it
 * @param commands - the commands to choose from; `main.ts` passes the generated list
 * @param secrets - the raw secrets store. It is wrapped here, once, so every
 *   value a command loads is scrubbed from the errors the CLI prints; no
 *   command sees this one.
 */
export async function runCli(
  args: readonly string[],
  io: CliIo,
  commands: readonly CliCommand[],
  secrets: Secrets = noSecrets,
): Promise<ExitCode> {
  const { options, args: commandLine } = readGlobalOptions(args);
  const [name, ...rest] = commandLine;
  if (name === undefined || helpFlags.has(name) || name === "help") {
    printLines(io.out, overallHelp(commands));
    return name === undefined ? exitCode.usage : exitCode.ok;
  }
  const command = commands.find((candidate) => candidate.name === name);
  if (command === undefined) {
    printError(unknownCommand(name, commands), io.err, { debug: options.debug });
    return exitCode.usage;
  }
  if (rest.some((arg) => helpFlags.has(arg))) {
    printLines(io.out, commandHelp(command));
    return exitCode.ok;
  }
  const scrubber = new SecretScrubber();
  const context: CommandContext = { secrets: rememberedSecrets(secrets, scrubber) };
  return runCommand(command, rest, io, context, {
    usage: usageLine(command),
    debug: options.debug,
    scrubber,
  });
}

async function runCommand(
  command: CliCommand,
  args: readonly string[],
  io: CliIo,
  context: CommandContext,
  printContext: PrintErrorContext,
): Promise<ExitCode> {
  try {
    return await command.run(readInput(command, args), io, context);
  } catch (error) {
    // The CLI's one top-level catch: every error a command throws ends here.
    printError(error, io.err, printContext);
    return exitCodeFor(errorKindOf(error));
  }
}

/** The usage error for a command that doesn't exist, with "Did you mean" when one name is close. */
function unknownCommand(name: string, commands: readonly CliCommand[]): UsageError {
  const close = closestName(
    name,
    commands.map((command) => command.name),
  );
  const guess = close === undefined ? "" : ` Did you mean ${close}?`;
  return new UsageError(`There's no command "${name}".${guess}`, {
    fix: "Run halonic --help to see every command.",
  });
}

function printLines(print: (line: string) => void, lines: readonly string[]): void {
  for (const line of lines) {
    print(line);
  }
}
