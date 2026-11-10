import type { ProgramExit, RunningProgram } from "./program.ts";

/** How long a program gets after each step of {@link stopProgram} before the next one. */
export const stopGraceMs = 2000;

/**
 * Stops a program as the MCP spec describes for stdio: close its input and
 * wait, then ask it to end and wait, then force it. Every step reaches the
 * programs it started too, such as the server under `npx`.
 */
export async function stopProgram(
  program: RunningProgram,
  graceMs = stopGraceMs,
): Promise<ProgramExit> {
  program.endInput();
  if (await endsWithin(program, graceMs)) return program.exited;
  program.signal("terminate");
  if (await endsWithin(program, graceMs)) return program.exited;
  program.signal("kill");
  return program.exited;
}

async function endsWithin(program: RunningProgram, ms: number): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<false>((resolve) => {
    timer = setTimeout(() => resolve(false), ms);
  });
  try {
    return await Promise.race([program.exited.then(() => true), timedOut]);
  } finally {
    clearTimeout(timer);
  }
}
