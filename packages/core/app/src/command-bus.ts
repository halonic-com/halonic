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

/** Thrown for a command nobody handles, or for a second handler of the same command. */
export class CommandError extends Error {
  override name = "CommandError";
}

/**
 * Typed commands with exactly one handler each. Features register the
 * commands they own; the UI, the CLI and the assistant execute them by name
 * (plan 4.2). Execution always returns a promise, so a caller doesn't need to
 * know whether a handler is synchronous.
 *
 * @example
 * const bus = new CommandBus<{ "greet": CommandSpec<string, string> }>();
 * bus.register("greet", (name) => `Hello ${name}`);
 * await bus.execute("greet", "Ada"); // "Hello Ada"
 */
export class CommandBus<Commands extends CommandMap<Commands>> {
  private readonly handlers = new Map<keyof Commands, CommandHandler<CommandSpec>>();

  /**
   * Sets the handler of a command.
   *
   * @returns a function that removes this handler again; it leaves a later handler alone
   * @throws CommandError when the command already has a handler
   */
  register<Name extends keyof Commands>(
    name: Name,
    handler: CommandHandler<Commands[Name]>,
  ): () => void {
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
    input: Commands[Name]["input"],
  ): Promise<Commands[Name]["output"]> {
    const handler = this.handlers.get(name);
    if (handler === undefined) {
      throw new CommandError(`No handler for the command "${String(name)}".`);
    }
    return (await handler(input)) as Commands[Name]["output"];
  }

  /** Removes every handler. The workspace scope calls this when it closes. */
  clear(): void {
    this.handlers.clear();
  }
}
