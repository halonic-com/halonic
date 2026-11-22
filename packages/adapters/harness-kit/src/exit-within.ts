import type { SandboxExit, SandboxProcess } from "@halonicjs/ports";

/**
 * How long a program may take to exit once its output has ended or its
 * input was closed. Claude Code and Codex exit within a second or two then;
 * this only stops one that hangs on its way out.
 */
export const exitGraceMs = 10_000;

/**
 * The program's exit, waiting at most `graceMs` for it (failure-path rule 1:
 * every wait ends). A program still running by then is killed, with
 * everything it started, and the wait gives `"stopped"` instead of failing,
 * for a harness that already has the program's result and keeps it
 * (HAL-15968).
 *
 * @throws Error when killing the program fails: it may still be running
 * @example
 * const exit = await stopUnlessExited(process);
 * if (exit === "stopped") yield stoppedEvent;
 */
export async function stopUnlessExited(
  process: SandboxProcess,
  graceMs = exitGraceMs,
): Promise<SandboxExit | "stopped"> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<"timed-out">((resolve) => {
    timer = setTimeout(() => resolve("timed-out"), graceMs);
  });
  try {
    const first = await Promise.race([process.exited, timedOut]);
    if (first !== "timed-out") return first;
  } finally {
    clearTimeout(timer);
  }
  await process.kill();
  return "stopped";
}

/**
 * The program's exit, waiting at most `graceMs` for it, as
 * {@link stopUnlessExited} does, for a harness that has no result yet: a
 * program still running by then is killed, and the wait fails with a plain
 * error that names it.
 *
 * @param name - the program as people know it, such as "Claude Code"
 * @throws Error when the program hadn't exited after `graceMs`; it has been killed by then
 * @example
 * const exit = await exitWithin(process, "Codex");
 */
export async function exitWithin(
  process: SandboxProcess,
  name: string,
  graceMs = exitGraceMs,
): Promise<SandboxExit> {
  const exit = await stopUnlessExited(process, graceMs);
  if (exit !== "stopped") return exit;
  throw new Error(`${name} didn't exit within ${graceMs / 1000} seconds, so Halonic stopped it.`);
}
