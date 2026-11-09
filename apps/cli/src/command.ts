import type { Secrets } from "@halonicjs/ports";
import type { ExitCode } from "./exit-code.ts";

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
  /** One line for the help. */
  readonly description: string;
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
  /** One line for the command list. */
  readonly summary: string;
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
 * The command line was wrong. The CLI prints the message with its own `fix`,
 * or else the command's usage line, as its fix, and exits with code 2, as for
 * any `invalid_input` error.
 */
export class UsageError extends Error {
  override readonly name = "UsageError";
  readonly kind = "invalid_input";
  /** The next step, when the usage line isn't it, such as "Run halonic --help to see every command." */
  readonly fix: string | undefined;

  constructor(message: string, options: { readonly fix?: string } = {}) {
    super(message);
    this.fix = options.fix;
  }
}
