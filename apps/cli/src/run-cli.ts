import { errorKindOf } from "@halonicjs/std";
import type { CliCommand, CliIo } from "./command.ts";
import { type ExitCode, exitCode } from "./exit-code.ts";
import { exitCodeFor } from "./exit-code-for.ts";
import { type GlobalOptions, readGlobalOptions } from "./global-options.ts";
import { commandHelp, overallHelp, usageLine } from "./help.ts";
import { printError } from "./print-error.ts";
import { readInput } from "./read-input.ts";

const helpFlags = new Set(["--help", "-h"]);

/**
 * Runs one `halonic` command line and returns the exit code. Output goes
 * through `io`, so tests run the CLI in-process and read what it printed.
 *
 * @param args - the command line after `halonic`, with global options such
 *   as `--debug` anywhere in it
 * @param commands - the commands to choose from; `main.ts` passes the generated list
 */
export async function runCli(
  args: readonly string[],
  io: CliIo,
  commands: readonly CliCommand[],
): Promise<ExitCode> {
  const { options, args: commandLine } = readGlobalOptions(args);
  const [name, ...rest] = commandLine;
  if (name === undefined || helpFlags.has(name) || name === "help") {
    printLines(io.out, overallHelp(commands));
    return name === undefined ? exitCode.usage : exitCode.ok;
  }
  const command = commands.find((candidate) => candidate.name === name);
  if (command === undefined) {
    io.err(`Unknown command "${name}".`);
    printLines(io.err, overallHelp(commands));
    return exitCode.usage;
  }
  if (rest.some((arg) => helpFlags.has(arg))) {
    printLines(io.out, commandHelp(command));
    return exitCode.ok;
  }
  return runCommand(command, rest, io, options);
}

async function runCommand(
  command: CliCommand,
  args: readonly string[],
  io: CliIo,
  options: GlobalOptions,
): Promise<ExitCode> {
  try {
    return await command.run(readInput(command, args), io);
  } catch (error) {
    // The CLI's one top-level catch: every error a command throws ends here.
    printError(error, io.err, { usage: usageLine(command), debug: options.debug });
    return exitCodeFor(errorKindOf(error));
  }
}

function printLines(print: (line: string) => void, lines: readonly string[]): void {
  for (const line of lines) {
    print(line);
  }
}
