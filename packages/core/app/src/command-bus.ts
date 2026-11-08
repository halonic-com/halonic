/** What a command takes and what it gives back. */
export interface CommandSpec<Input = unknown, Output = unknown> {
  input: Input;
  output: Output;
}

/** A map from command names to their {@link CommandSpec}, such as `{ "files.save": CommandSpec<void, number> }`. */
export type CommandMap<Commands> = { [Name in keyof Commands]: CommandSpec };

/** Runs one command. It may answer at once or later. */
export type CommandHandler<Spec extends CommandSpec> = (
  input: Spec["input"],
) => Spec["output"] | Promise<Spec["output"]>;

/**
 * The arguments after the name in {@link CommandBus.execute}: a command
 * whose input may be `undefined` (such as `void`) may leave it out, as in
 * `execute("workspace.save")`.
 */
export type CommandInput<Spec extends CommandSpec> = [undefined] extends [Spec["input"]]
  ? [input?: Spec["input"]]
  : [input: Spec["input"]];

/** Thrown for a command nobody handles, for a second handler of the same command, or after the bus closed. */
export class CommandError extends Error {
  override name = "CommandError";
}

/**
 * Typed commands with exactly one handler each. Features register the
 * commands they own; the UI, the CLI and the assistant execute them by name.
 * Execution always returns a promise, so a caller doesn't need to
 * know whether a handler is synchronous.
 *
 * @example
 * const bus = new CommandBus<{ "greet": CommandSpec<string, string> }>();
 * bus.register("greet", (name) => `Hello ${name}`);
 * await bus.execute("greet", "Ada"); // "Hello Ada"
 * // A command whose input is void needs no argument: bus.execute("workspace.save")
 */
export class CommandBus<Commands extends CommandMap<Commands>> {
  private readonly handlers = new Map<keyof Commands, CommandHandler<CommandSpec>>();
  private closed = false;

  /**
   * Sets the handler of a command.
   *
   * @returns a function that removes this handler again; it leaves a later handler alone
   * @throws CommandError when the command already has a handler, or the bus is closed
   */
  register<Name extends keyof Commands>(
    name: Name,
    handler: CommandHandler<Commands[Name]>,
  ): () => void {
    if (this.closed) {
      // Such as a feature that finished loading after its workspace closed.
      throw new CommandError(
        `The command "${String(name)}" can't be registered: the bus is closed.`,
      );
    }
    if (this.handlers.has(name)) {
      throw new CommandError(`The command "${String(name)}" already has a handler.`);
    }
    // Stored untyped; `execute` restores the type from the same name.
    const entry = handler as unknown as CommandHandler<CommandSpec>;
    this.handlers.set(name, entry);
    return () => {
      if (this.handlers.get(name) === entry) {
        this.handlers.delete(name);
      }
    };
  }

  /** Whether a command has a handler, for menus that hide what can't run. */
  has(name: keyof Commands): boolean {
    return this.handlers.has(name);
  }

  /**
   * Runs a command through its handler.
   *
   * @returns what the handler returns; a handler that throws makes the promise reject
   * @throws CommandError (as a rejection) when the command has no handler
   */
  async execute<Name extends keyof Commands>(
    name: Name,
    ...[input]: CommandInput<Commands[Name]>
  ): Promise<Commands[Name]["output"]> {
    const handler = this.handlers.get(name);
    if (handler === undefined) {
      throw new CommandError(`No handler for the command "${String(name)}".`);
    }
    return (await handler(input)) as Commands[Name]["output"];
  }

  /**
   * Removes every handler and refuses new ones. The workspace scope calls
   * this when it closes.
   */
  close(): void {
    this.closed = true;
    this.handlers.clear();
  }
}
