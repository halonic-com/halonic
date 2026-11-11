/** Version of the {@link ProgramProbe} port. A breaking change bumps it and comes with an ADR. */
export const programProbeVersion = 2;

/**
 * What asking a program something answered. `missing`: no program of that
 * name is where Halonic looks for it. `ran`: it ran and ended, with what it
 * wrote; `code` is `null` when a signal ended it. `failed`: it was found but
 * couldn't be run, or didn't end in time; `error` says which, in one plain
 * sentence.
 */
export type ProgramProbeResult =
  | { status: "missing" }
  | { status: "ran"; path: string; code: number | null; stdout: string; stderr: string }
  | { status: "failed"; path: string; error: string };

/**
 * The program's own settings folder, for a question about one agent's
 * settings, such as whether that agent is signed in. `variable` is the
 * environment variable that points the program at the folder, such as
 * "CLAUDE_CONFIG_DIR"; `path` is the folder, an absolute path.
 */
export interface ProgramSettingsFolder {
  readonly variable: string;
  readonly path: string;
}

/** What else a question to a program may say. */
export interface ProgramQuestion {
  /**
   * Asks the program about this settings folder instead of the person's
   * own. A probe sets only this variable on top of what it always passes,
   * and refuses a variable it doesn't know as `failed`, so this can't pass
   * anything else to the program.
   */
  readonly settingsFolder?: ProgramSettingsFolder;
}

/**
 * Finds a program on this machine and asks it something short, such as
 * `claude --version`, the way a harness's `detect()` needs (requirement
 * `ports.program-probe`). The launcher (`sandbox-host`) provides it, so a
 * harness finds its program where the sandbox will start it from.
 *
 * The program is found by name the same way the launcher starts it: as an
 * absolute path, never through a shell. It gets no secrets in its
 * environment, a short time limit chosen by the adapter, and its output is
 * cut to a few kilobytes.
 *
 * @example
 * const answer = await probe.ask("codex", ["--version"]);
 * if (answer.status === "missing") return { status: "missing" };
 * const signIn = await probe.ask("codex", ["login", "status"], {
 *   settingsFolder: { variable: "CODEX_HOME", path: agentFolder },
 * });
 */
export interface ProgramProbe {
  /**
   * Runs `program` with `args` and reports how it went. Never throws: a
   * problem is a {@link ProgramProbeResult}.
   *
   * @param program a bare name, such as "claude". A name with a path separator is `missing`.
   */
  ask(
    program: string,
    args: readonly string[],
    question?: ProgramQuestion,
  ): Promise<ProgramProbeResult>;
}
