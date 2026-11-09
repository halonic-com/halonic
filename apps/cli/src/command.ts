import type { Secrets } from "@halonicjs/ports";
import type { ExitCode } from "./exit-code.ts";
import type { Message } from "./messages/define.ts";
import { plainText } from "./messages/phrase.ts";

/** Where a command writes and which folder it works from, passed in so tests can capture both. */
export interface CliIo {
  /** The folder relative paths are resolved from. */
  readonly cwd: string;
  /** Writes one line of normal output. */
  out(line: string): void;
  /** Writes one line of error output. */
  err(line: string): void;
}

/** What `runCli` hands a command besides its input and io. */
export interface CommandContext {
  /**
   * The secrets store, wrapped by `runCli` so every value it hands out is
   * scrubbed from the errors the CLI prints. Pass this one on to anything
   * the command builds (the engine, providers, integrations), never a raw
   * adapter.
   */
  readonly secrets: Secrets;
}

/** One option a command accepts, such as `--hub <id>`. */
export interface CliOption {
  /** A string option takes a value; a boolean option is a switch. */
  readonly type: "string" | "boolean";
  /** Whether the option may be given more than once, collecting every value. */
  readonly multiple?: boolean;
  /** The value's name in the help, such as `id` in `--hub <id>`. */
  readonly valueName?: string;
  /** One line for the help, from the command's area of the catalogue. */
  readonly description: Message;
}

/** The value of one option: text for a string option, true for a switch. */
export type OptionValue = string | boolean;

/** The command line after the command name, read against the command's options. */
export interface CommandInput {
  /** The arguments that aren't options, in order. */
  readonly positionals: readonly string[];
  /** The options given, by name: text for a string option, true for a switch, a list for a `multiple` option. */
  readonly options: Readonly<Record<string, OptionValue | readonly OptionValue[] | undefined>>;
}

/**
 * A `halonic` command. Each lives in `src/commands/<name>/command.ts` and
 * exports `<name>Command`; `pnpm discover` lists them (see `discover` in
 * `package.json`), and the help is made
 * from these fields, so adding a command changes no shared file.
 */
export interface CliCommand {
  /** The word after `halonic`, the same as its folder name. */
  readonly name: string;
  /** The arguments after the name, for the help, such as `<dir> [--hub <id>]`. */
  readonly usage: string;
  /** One line for the command list, from the command's area of the catalogue (cli-output 1.9). */
  readonly summary: Message;
  /**
   * What the command does to what, for line 1 of its errors: "write the
   * schemas" makes "✕ Couldn't write the schemas: the disk is full.". Without
   * it, line 1 is the error's own message.
   */
  action?(input: CommandInput): Message;
  /** The options it accepts, by name without the dashes. */
  readonly options: Readonly<Record<string, CliOption>>;
  /**
   * Runs the command.
   *
   * @throws UsageError when the arguments are wrong. Any other error ends the
   *   command with the exit code of its kind (1 when it has none), and
   *   `printError` prints it; the command never prints an error itself.
   */
  run(input: CommandInput, io: CliIo, context: CommandContext): Promise<ExitCode>;
}

/**
 * Every command by its folder name, as `pnpm discover` writes it to
 * `src/generated/commands.ts`. A key is always the command's `name`.
 */
export type CommandRegistry = Readonly<Record<string, CliCommand>>;

/**
 * The command line was wrong. The CLI prints the problem, then the fix: the
 * one given here, or else the command's usage line. It exits with code 2, as
 * for any `invalid_input` error.
 */
export class UsageError extends Error {
  override readonly name = "UsageError";
  readonly kind = "invalid_input";
  /** The problem, as the catalogue words it. */
  readonly problem: Message;
  /** The one next step; when it's missing the CLI shows the command's usage line. */
  readonly fixMessage: Message | undefined;

  constructor(problem: Message, fix?: Message) {
    super(plainText(problem.phrase));
    this.problem = problem;
    this.fixMessage = fix;
  }
}
