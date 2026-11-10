import type { ProgramExit, RunningProgram } from "./program.ts";

/**
 * Stops a program as the MCP spec describes for stdio: close its input and
 * wait `graceMs`, then ask it to end and wait again, then force it. Every
 * step reaches the programs it started too, such as the server under `npx`.
 */
export async function stopProgram(program: RunningProgram, graceMs: number): Promise<ProgramExit> {
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
