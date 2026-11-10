import type { Secrets } from "@halonicjs/ports";
import { errorKindOf, SecretScrubber } from "@halonicjs/std";
import { closestName } from "./closest-name.ts";
import {
  type CliCommand,
  type CliIo,
  type CommandContext,
  type CommandPath,
  UsageError,
} from "./command.ts";
import { type ExitCode, exitCode } from "./exit-code.ts";
import { exitCodeFor } from "./exit-code-for.ts";
import { helpFlags, readGlobalOptions } from "./global-options.ts";
import { commandHelp, commandWords, lastOf, overallHelp, usageLine } from "./help.ts";
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
  const found = findSubcommand([command], rest);
  if (found instanceof UsageError) {
    printError(found, io.err, { debug: options.debug });
    return exitCode.usage;
  }
  const { path, args: commandArgs } = found;
  if (commandArgs.some((arg) => helpFlags.has(arg))) {
    printLines(io.out, commandHelp(path));
    return exitCode.ok;
  }
  if (lastOf(path).run === undefined) {
    // A command that only hands off, such as `halonic plugin` on its own: show what it hands off to.
    printLines(io.out, commandHelp(path));
    return exitCode.usage;
  }
  const scrubber = new SecretScrubber();
  const context: CommandContext = { secrets: rememberedSecrets(secrets, scrubber) };
  return runCommand(path, commandArgs, io, context, {
    usage: usageLine(path),
    debug: options.debug,
    scrubber,
  });
}

/** A command line read down to the command that runs. */
interface FoundCommand {
  readonly path: CommandPath;
  /** The arguments after the last command word. */
  readonly args: readonly string[];
}

/**
 * Follows the words after a command into its subcommands, as long as the next
 * word isn't an option: `runs show 01JD8Q` ends at `show` with `01JD8Q` left.
 *
 * @returns the command that runs, or the usage error for a word that isn't
 *   one of the subcommands
 */
function findSubcommand(path: CommandPath, args: readonly string[]): FoundCommand | UsageError {
  const subcommands = lastOf(path).subcommands ?? [];
  const [word, ...rest] = args;
  if (subcommands.length === 0 || word === undefined || word.startsWith("-")) {
    return { path, args };
  }
  const subcommand = subcommands.find((candidate) => candidate.name === word);
  if (subcommand === undefined) {
    return unknownSubcommand(path, word);
  }
  return findSubcommand([...path, subcommand], rest);
}

async function runCommand(
  path: CommandPath,
  args: readonly string[],
  io: CliIo,
  context: CommandContext,
  printContext: PrintErrorContext,
): Promise<ExitCode> {
  const command = lastOf(path);
  try {
    const input = readInput(command, args);
    const [word] = input.positionals;
    // A command with subcommands takes no arguments, so a word after its options names a subcommand.
    if (command.subcommands !== undefined && word !== undefined) {
      throw unknownSubcommand(path, word);
    }
    return await (command.run?.(input, io, context) ?? exitCode.usage);
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

/**
 * The usage error for a word that isn't one of a command's subcommands, in
 * the shape of {@link unknownCommand} with the command's words in front:
 * `There's no command "runs shwo". Did you mean runs show?`, then where to
 * see them.
 */
function unknownSubcommand(path: CommandPath, word: string): UsageError {
  const words = commandWords(path);
  const close = closestName(
    word,
    (lastOf(path).subcommands ?? []).map((command) => command.name),
  );
  const guess = close === undefined ? "" : ` Did you mean ${words} ${close}?`;
  return new UsageError(`There's no command "${words} ${word}".${guess}`, {
    fix: `Run halonic ${words} --help to see its commands.`,
  });
}

function printLines(print: (line: string) => void, lines: readonly string[]): void {
  for (const line of lines) {
    print(line);
  }
}
