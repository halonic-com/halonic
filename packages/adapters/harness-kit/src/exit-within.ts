import type { SandboxExit, SandboxProcess } from "@halonicjs/ports";

/**
 * How long a program may take to exit once its output has ended or its
 * input was closed. Claude Code and Codex exit within a second or two then;
 * this only stops one that hangs on its way out.
 */
export const exitGraceMs = 10_000;

/**
 * The program's exit, waiting at most `graceMs` for it (failure-path rule 1:
 * every wait ends). A program still running by then is killed, and the wait
 * fails with a plain error that names it.
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
  throw new Error(`${name} didn't exit within ${graceMs / 1000} seconds, so Halonic stopped it.`);
}
