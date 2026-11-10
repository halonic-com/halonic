import type { Secrets } from "@halonicjs/ports";
import { type ErrorKind, KindedError } from "@halonicjs/std";
import type { ExitCode } from "./exit-code.ts";
import type { Message } from "./messages/define.ts";
import { type Phrase, plainText } from "./messages/phrase.ts";
import type { Progress } from "./output/progress.ts";
import type { Question } from "./output/question.ts";

/** Where the CLI writes and which folder it works from, passed in so tests can capture both. */
export interface CliIo {
  /** The folder relative paths are resolved from. */
  readonly cwd: string;
  /** Writes one line of normal output. */
  out(line: string): void;
  /** Writes one line of error output. */
  err(line: string): void;
}

/** What `runCli` hands a command besides its input. */
export interface CommandContext {
  /** The folder relative paths are resolved from. */
  readonly cwd: string;
  /**
   * The secrets store, wrapped by `runCli` so every value it hands out is
   * scrubbed from the errors the CLI prints. Pass this one on to anything
   * the command builds (the engine, providers, integrations), never a raw
   * adapter.
   */
  readonly secrets: Secrets;
  /**
   * Starts the live ◌ line of a step that may take a while (cli-output 1.5),
   * such as "Draft reply". End it before the step's finished line is
   * returned; `runCli` takes it away when the command ends in any case.
   * Through a pipe, with `--json` or in CI it draws nothing.
   */
  progress(doing: Phrase): Progress;
  /**
   * Asks the user a yes-or-no question with `[y/N]` on stderr and returns
   * whether they said yes (cli-output 1.7). Its `shownFirst` lines come
   * right before it, such as the trust check before "Trust Acme on this
   * computer?". It may be called more than once, each question in turn.
   * With the question's `yes` set it asks nothing and returns yes; where
   * nobody can answer (no terminal on stdin, `CI` or `--json`) it asks
   * nothing and throws the question's refusal. End a step's live line
   * before asking. Ctrl C or SIGTERM while it waits ends the question and
   * throws the `AbortError`, as {@link CommandContext.signal} does for any work.
   */
  ask(question: Question): Promise<boolean>;
  /**
   * Aborted at the first Ctrl C or SIGTERM (cli-output 1.5). The command
   * passes it on to what it starts, winds down, and returns a
   * {@link StoppedResult}.
   */
  readonly signal: AbortSignal;
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
 * The fields a command adds to its `--json` document (cli-output 1.8), as the
 * CLI reference lists them. `runCli` sets `outputVersion`, `ok` and `error`,
 * so a command can't.
 */
export type JsonFields = Readonly<Record<string, unknown>> & {
  readonly outputVersion?: never;
  readonly ok?: never;
  readonly error?: never;
};

/**
 * What a command did, for `runCli` to print: the lines for a person, or the
 * fields for `--json`. A command returns this and prints nothing, so every
 * command gets the same colour, marks and `--json` (the thin-command rule).
 */
export interface CommandResult {
  /** The exit code; with 0 the `--json` document says `"ok": true`. */
  readonly exitCode: ExitCode;
  /** The result lines for stdout, in the catalogue's words, painted for the stream. Not printed with `--json`. */
  readonly lines: readonly Phrase[];
  /** The command's own `--json` fields. */
  readonly json: JsonFields;
}

/**
 * What a command returns when Ctrl C or SIGTERM stopped it. `runCli` prints
 * "Stopped." and what stopping meant to stderr, and exits with the signal's
 * code, 130 or 143, rather than an {@link ExitCode}.
 */
export interface StoppedResult {
  readonly stopped: true;
  /**
   * What stopping meant, from the command's area of the catalogue, such as
   * "The run 01JD8Q was cancelled after the step Classify. Nothing after it
   * ran." Left out, the line is only "Stopped.".
   */
  readonly meaning?: Phrase;
  /** The command's own `--json` fields, such as the run's status. */
  readonly json: JsonFields;
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
  action?(input: CommandInput, context: Pick<CommandContext, "cwd">): Message;
  /** The options it accepts, by name without the dashes. */
  readonly options: Readonly<Record<string, CliOption>>;
  /**
   * The commands under this one, such as `show` and `send` under `runs`, each
   * with its own word as `name`. `runCli` hands `halonic runs show <run-id>`
   * to `show` when the word comes right after `runs`, lists them in
   * `halonic runs --help`, and gives every command the same usage error for
   * a word that isn't one of them. A command with subcommands takes no
   * arguments of its own, only options.
   */
  readonly subcommands?: readonly CliCommand[];
  /**
   * Runs the command and returns what it did; `runCli` prints it. The
   * result is only the end: what happens while it runs, such as a live ◌
   * line or a yes-or-no question, goes through the context, whose functions
   * the printer owns (Liam,
   * HAL-2194). A command never writes to `CliIo` itself. A command that only
   * hands off to its subcommands, such as `plugin`, leaves it out: `halonic
   * plugin` on its own then prints its help and exits with 2, as `halonic`
   * on its own does.
   *
   * @throws UsageError when the arguments are wrong. Any other error ends the
   *   command with the exit code of its kind (1 when it has none), and
   *   `printError` prints it; the command never prints an error itself.
   */
  run?(input: CommandInput, context: CommandContext): Promise<CommandResult | StoppedResult>;
}

/**
 * A command as the user typed it: the top-level command first, then each
 * subcommand down to the one that runs, such as `runs` then `show`.
 */
export type CommandPath = readonly [CliCommand, ...CliCommand[]];

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

/**
 * An error whose message is a whole line 1, never put after the command's
 * "Couldn't *action*:", such as "There's no workflow called "suport-reply"
 * in acme." (cli-output 3.4). Its message and fix come from the catalogue.
 */
export class OwnLineError extends KindedError {
  constructor(kind: ErrorKind, line: Message, fix?: Message) {
    super(kind, plainText(line.phrase), fix === undefined ? {} : { fix: plainText(fix.phrase) });
  }
}
