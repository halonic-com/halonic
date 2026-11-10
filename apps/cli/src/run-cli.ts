import type { Secrets } from "@halonicjs/ports";
import { errorKindOf, SecretScrubber } from "@halonicjs/std";
import {
  type CliCommand,
  type CliIo,
  type CommandContext,
  type CommandInput,
  type CommandPath,
  UsageError,
} from "./command.ts";
import { type ExitCode, exitCode } from "./exit-code.ts";
import { exitCodeFor } from "./exit-code-for.ts";
import { type GlobalOptions, readGlobalOptions } from "./global-options.ts";
import { commandHelp, commandWords, lastOf, overallHelp, usageLine } from "./help.ts";
import { usageMessages } from "./messages/general.ts";
import { type Phrase, renderPhrase } from "./messages/phrase.ts";
import { nearMatch } from "./near-match.ts";
import { paintFor } from "./output/paint.ts";
import { decideStyle, type Environment } from "./output/style.ts";
import { printError } from "./print-error.ts";
import { readInput } from "./read-input.ts";
import { noSecrets, rememberedSecrets } from "./remembered-secrets.ts";

/** What the CLI needs to know about where it runs, to decide colour, live lines and marks. */
export interface Terminal {
  /** The process's environment. */
  readonly env: Environment;
  /** The operating system, as `process.platform` names it. */
  readonly platform: string;
  /** Whether stdout is a terminal, rather than a pipe or a file. */
  readonly stdoutIsTerminal: boolean;
  /** Whether stderr is a terminal. */
  readonly stderrIsTerminal: boolean;
}

/** Two pipes and an empty environment: plain text with the Unicode marks, as tests read it. */
const pipes: Terminal = {
  env: {},
  platform: "linux",
  stdoutIsTerminal: false,
  stderrIsTerminal: false,
};

/** What `runCli` is given besides the command line, the streams and the commands. */
export interface CliSetup {
  /** The environment and streams; leave it out for plain text, as through a pipe. */
  readonly terminal?: Terminal;
  /**
   * The raw secrets store. It is wrapped here, once, so every value a command
   * loads is scrubbed from the errors the CLI prints; no command sees this one.
   */
  readonly secrets?: Secrets;
}

/** Where the CLI writes phrases: results to stdout, everything else to stderr (cli-output section 2). */
interface Streams {
  out(line: Phrase): void;
  err(line: Phrase): void;
}

/**
 * Runs one `halonic` command line and returns the exit code. Output goes
 * through `io`, so tests run the CLI in-process and read what it printed.
 *
 * @param args - the command line after `halonic`, with global options such
 *   as `--debug` anywhere in it
 * @param commands - the commands to choose from; `main.ts` passes the generated list
 * @param setup - the terminal and the secrets store; both have plain defaults for tests
 */
export async function runCli(
  args: readonly string[],
  io: CliIo,
  commands: readonly CliCommand[],
  setup: CliSetup = {},
): Promise<ExitCode> {
  const { options, args: commandLine } = readGlobalOptions(args);
  const streams = streamsFor(io, setup.terminal ?? pipes, options);
  const [name, ...commandArgs] = commandLine;
  if (name === undefined || name === "help") {
    printLines(streams.out, overallHelp(commands));
    return name === undefined && !options.help ? exitCode.usage : exitCode.ok;
  }
  const command = commands.find((candidate) => candidate.name === name);
  if (command === undefined) {
    const near = nearMatch(
      name,
      commands.map((candidate) => candidate.name),
    );
    const problem =
      near === undefined
        ? usageMessages.unknownCommand(name)
        : usageMessages.unknownCommandNear(name, near);
    printError(new UsageError(problem, usageMessages.seeEveryCommand()), streams.err);
    return exitCode.usage;
  }
  const found = findSubcommand([command], commandArgs);
  if (found instanceof UsageError) {
    printError(found, streams.err);
    return exitCode.usage;
  }
  const { path, args: pathArgs } = found;
  if (options.help) {
    printLines(streams.out, commandHelp(path));
    return exitCode.ok;
  }
  if (lastOf(path).run === undefined) {
    // A command that only hands off, such as `halonic plugin` on its own: show what it hands off to.
    printLines(streams.out, commandHelp(path));
    return exitCode.usage;
  }
  const scrubber = new SecretScrubber();
  const context: CommandContext = {
    secrets: rememberedSecrets(setup.secrets ?? noSecrets, scrubber),
  };
  return runCommand(path, pathArgs, io, context, streams, options, scrubber);
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
  streams: Streams,
  options: GlobalOptions,
  scrubber: SecretScrubber,
): Promise<ExitCode> {
  const command = lastOf(path);
  let input: CommandInput | undefined;
  try {
    input = readInput(command, args);
    const [word] = input.positionals;
    // A command with subcommands takes no arguments, so a word after its options names a subcommand.
    if (command.subcommands !== undefined && word !== undefined) {
      throw wordAfterOptions(path, word);
    }
    return await (command.run?.(input, io, context) ?? exitCode.usage);
  } catch (error) {
    // The CLI's one top-level catch: every error a command throws ends here.
    printError(error, streams.err, {
      usage: usageLine(path),
      ...(input !== undefined && command.action !== undefined
        ? { action: command.action(input) }
        : {}),
      debug: options.debug,
      scrubber,
    });
    return exitCodeFor(errorKindOf(error));
  }
}

/** Each stream with its own style: stdout may be a pipe while stderr is still a terminal. */
function streamsFor(io: CliIo, terminal: Terminal, options: GlobalOptions): Streams {
  const styleFor = (isTerminal: boolean) =>
    decideStyle({
      env: terminal.env,
      isTerminal,
      platform: terminal.platform,
      noColor: options.noColor,
      json: options.json,
    });
  const outPaint = paintFor(styleFor(terminal.stdoutIsTerminal));
  const errPaint = paintFor(styleFor(terminal.stderrIsTerminal));
  return {
    out: (line) => io.out(renderPhrase(line, outPaint)),
    err: (line) => io.err(renderPhrase(line, errPaint)),
  };
}

/**
 * The usage error for a word that isn't one of a command's subcommands, in
 * the shape of an unknown command with the command's words in front:
 * `There's no command "runs shwo". Did you mean runs show?`, then where to
 * see them.
 */
function unknownSubcommand(path: CommandPath, word: string): UsageError {
  const words = commandWords(path);
  const near = nearMatch(
    word,
    (lastOf(path).subcommands ?? []).map((command) => command.name),
  );
  const problem =
    near === undefined
      ? usageMessages.unknownCommand(`${words} ${word}`)
      : usageMessages.unknownCommandNear(`${words} ${word}`, `${words} ${near}`);
  return new UsageError(problem, usageMessages.seeSubcommands(words));
}

/**
 * The usage error for a word that comes after a command's options. A real
 * subcommand there is only in the wrong place, so the error says where it
 * goes instead of claiming it doesn't exist: `halonic runs --limit 5 show
 * 01JD8Q` gets "show goes right after runs, before any options." with the
 * usage line of `runs show` as its fix (cli-output 1.3: line 1 says what's
 * wrong, line 2 is the fix). Any other word gets {@link unknownSubcommand}.
 */
function wordAfterOptions(path: CommandPath, word: string): UsageError {
  const subcommand = (lastOf(path).subcommands ?? []).find((candidate) => candidate.name === word);
  if (subcommand === undefined) {
    return unknownSubcommand(path, word);
  }
  return new UsageError(
    usageMessages.subcommandPlacement(word, commandWords(path)),
    usageLine([...path, subcommand]),
  );
}

function printLines(print: (line: Phrase) => void, lines: readonly Phrase[]): void {
  for (const line of lines) {
    print(line);
  }
}
