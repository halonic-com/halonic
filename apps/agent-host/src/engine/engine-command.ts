// `halonic-agent-host --engine --profile-folder <folder> --workspace <folder>`:
// the workspace's engine, run for Studio's shell over the control pipe on
// standard input and output (B1, HAL-17051).
import type { Readable, Writable } from "node:stream";
import { engineArgumentsOf } from "./engine-arguments.ts";
import { runEngineRole } from "./engine-role.ts";
import { engineRoleParts } from "./open-engine.ts";

/** The host's standard streams, as the engine role uses them. */
export interface EngineIo {
  readonly input: Readable;
  writeError(text: string): void;
  /** Takes standard output over for the control pipe's frames. */
  takeOutput(): Writable;
}

/**
 * Runs the engine role when `args` ask for it.
 *
 * @returns `undefined` without `--engine`; otherwise the role's exit code,
 *   or 2 when the command line is refused, before anything opens
 */
export function engineCommand(
  args: readonly string[],
  version: string,
  io: EngineIo,
): Promise<number> | undefined {
  if (!args.includes("--engine")) return undefined;
  const given = engineArgumentsOf(args);
  if ("error" in given) {
    io.writeError(given.error);
    return Promise.resolve(2);
  }
  const parts = engineRoleParts(given, version, (text) => io.writeError(text));
  return runEngineRole(io.input, io.takeOutput(), parts);
}
