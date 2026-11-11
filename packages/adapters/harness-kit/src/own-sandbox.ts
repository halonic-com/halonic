import type { ProgramProbe } from "@halonicjs/ports";

/**
 * Whether a harness's program can use its own sandbox on this computer.
 * A harness asks it only for a run outside Halonic's fence, where the
 * program's own sandbox is the only one around its shell commands.
 */
export type OwnSandboxCheck = () => Promise<boolean>;

/** What {@link ownSandboxCheck} is told. */
export interface OwnSandboxCheckOptions {
  /** Finds and asks the programs the check needs. */
  probe: ProgramProbe;
  /** Other programs the harness's sandbox needs on Linux, such as `socat` for Claude Code. */
  linuxNeeds?: readonly string[];
  /** The system, as Node names it; this computer's when absent. */
  platform?: NodeJS.Platform;
}

/**
 * The arguments that make `bwrap` start `true` in a new network namespace,
 * with the computer's files read-only: the least Claude Code's and Codex's
 * sandboxes need from it. Exit code 0 means it works here.
 */
export const bwrapCheckArgs: readonly string[] = [
  "--ro-bind",
  "/",
  "/",
  "--dev",
  "/dev",
  "--unshare-net",
  "--",
  "true",
];

/**
 * Whether the program's own sandbox works on this system (requirement
 * `harness-kit.own-sandbox`), as checked on HAL-5354:
 *
 * - macOS: yes. Both programs use the system's own sandbox.
 * - Windows: no. Codex's refuses every shell command there, and Claude
 *   Code's isn't there at all, so turning it on would only break the run.
 * - Linux: only when `bwrap` (bubblewrap) runs here, with every program in
 *   `linuxNeeds`. Without them the programs refuse every shell command, or
 *   run them with no sandbox.
 *
 * Every answer is checked again for each run, so a program installed in
 * the meantime counts.
 *
 * @example
 * const ownSandbox = ownSandboxCheck({ probe, linuxNeeds: ["socat"] });
 * if (session.fence.state === "off" && (await ownSandbox())) args.push("--settings", file);
 */
export function ownSandboxCheck(options: OwnSandboxCheckOptions): OwnSandboxCheck {
  const platform = options.platform ?? process.platform;
  const { probe, linuxNeeds = [] } = options;
  return async () => {
    if (platform === "darwin") return true;
    if (platform !== "linux") return false;
    const checks = [
      runs(probe, "bwrap", bwrapCheckArgs),
      ...linuxNeeds.map((program) => runs(probe, program, ["-V"])),
    ];
    return (await Promise.all(checks)).every(Boolean);
  };
}

/** Whether `program` is found and ends with 0 when asked `args`. */
async function runs(
  probe: ProgramProbe,
  program: string,
  args: readonly string[],
): Promise<boolean> {
  const answer = await probe.ask(program, args);
  return answer.status === "ran" && answer.code === 0;
}
