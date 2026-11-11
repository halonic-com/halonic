/** What to start: one program, its arguments as separate strings, and no shell. */
export interface ProgramLaunch {
  readonly program: string;
  readonly args: readonly string[];
  /** The program's whole environment: nothing else is inherited. */
  readonly env: Readonly<Record<string, string>>;
  /**
   * The part of `env` the connector file writes. Only these values are read
   * for a skill's `scripts/` folder: the app's own environment and the
   * secret values aren't workspace content, so a path in them refuses
   * nothing (HAL-4777).
   */
  readonly checkedEnv: Readonly<Record<string, string>>;
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
   * Writes text to the program's standard input. It always settles: a write
   * waiting on a full pipe rejects once the program has ended or its input
   * is closed, so stopping the program never leaves a request waiting.
   *
   * @throws when the program no longer reads it
   */
  write(text: string): Promise<void>;
  /** Closes the program's standard input: the first step of stopping it. Never throws. */
  endInput(): void;
  readonly stdout: AsyncIterable<Uint8Array>;
  readonly stderr: AsyncIterable<Uint8Array>;
  /** Settles once the program has ended. Never rejects. */
  readonly exited: Promise<ProgramExit>;
  /**
   * Signals the program and everything it started: `terminate` asks it to
   * end, `kill` forces it. Never throws, even when they have already ended.
   */
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
