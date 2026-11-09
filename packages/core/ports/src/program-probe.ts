/** Version of the {@link ProgramProbe} port. A breaking change bumps it and comes with an ADR. */
export const programProbeVersion = 1;

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
 */
export interface ProgramProbe {
  /**
   * Runs `program` with `args` and reports how it went. Never throws: a
   * problem is a {@link ProgramProbeResult}.
   *
   * @param program a bare name, such as "claude". A name with a path separator is `missing`.
   */
  ask(program: string, args: readonly string[]): Promise<ProgramProbeResult>;
}
