/** What to start: one program, its arguments as separate strings, and no shell. */
export interface ProgramLaunch {
  readonly program: string;
  readonly args: readonly string[];
  /** The program's whole environment: nothing else is inherited. */
  readonly env: Readonly<Record<string, string>>;
  readonly cwd: string;
}

/** How a program ended. */
export interface ProgramExit {
  readonly code: number | null;
  readonly signal: string | null;
}

/** A started program, as the stdio transport talks to it. */
export interface RunningProgram {
  /**
   * Writes text to the program's standard input.
   *
   * @throws when the program no longer reads it
   */
  write(text: string): Promise<void>;
  /** Closes the program's standard input: the first step of stopping it. */
  endInput(): void;
  readonly stdout: AsyncIterable<Uint8Array>;
  readonly stderr: AsyncIterable<Uint8Array>;
  /** Settles once the program has ended. Never rejects. */
  readonly exited: Promise<ProgramExit>;
  /** Signals the program and everything it started: `terminate` asks it to end, `kill` forces it. */
  signal(kind: "terminate" | "kill"): void;
}

/**
 * Starts programs. The one real starter is `nodeProgramStarter`; tests use
 * an in-process fake, so no test of the connector starts a real program.
 */
export interface ProgramStarter {
  /**
   * Starts the program.
   *
   * @throws when it can't be started
   */
  start(launch: ProgramLaunch): Promise<RunningProgram>;
}
