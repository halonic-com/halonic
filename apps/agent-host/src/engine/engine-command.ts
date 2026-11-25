// `halonic-agent-host --engine --profile-folder <folder> --workspace <folder>`:
// the workspace's engine, run for Studio's shell over the control pipe on
// standard input and output (B1, HAL-17051).
import type { Readable, Writable } from "node:stream";
import { engineArgumentsOf } from "./engine-arguments.ts";
import { runEngineRole } from "./engine-role.ts";
import { type EngineCommandParts, engineRoleParts } from "./open-engine.ts";
import { SecretRedactor } from "./secret-redactor.ts";

/** The host's standard streams, as the engine role uses them. */
export interface EngineIo {
  readonly input: Readable;
  writeError(text: string): void;
  /**
   * Redacts every secret `redactor` learns from standard error, uncaught
   * errors included; absent in tests that pass their own streams.
   */
  redactStandardError?: ((redactor: SecretRedactor) => void) | undefined;
  /** Takes standard output over for the control pipe's frames. */
  takeOutput(): Writable;
  /** Ends the process with `code`; `process.exit` by default. */
  exit?(code: number): void;
}

/**
 * Runs the engine role when `args` ask for it. When its stop gave
 * `engine.lock` up while a step still ran, it ends the process once the
 * last frame is written, so that step can't write to a run store another
 * engine may already hold.
 *
 * @param makeParts - the engine role's parts; this computer's by default, a test's fakes otherwise
 * @returns `undefined` without `--engine`; otherwise the role's exit code,
 *   or 2 when the command line is refused, before anything opens
 */
export function engineCommand(
  args: readonly string[],
  version: string,
  io: EngineIo,
  makeParts: typeof engineRoleParts = engineRoleParts,
): Promise<number> | undefined {
  if (!args.includes("--engine")) return undefined;
  const given = engineArgumentsOf(args);
  if ("error" in given) {
    io.writeError(given.error);
    return Promise.resolve(2);
  }
  const redactor = new SecretRedactor();
  // Before standard output is taken: a stray print there goes to standard error.
  io.redactStandardError?.(redactor);
  const parts = makeParts(given, version, (text) => io.writeError(text), redactor);
  const output = io.takeOutput();
  return runEngineRole(io.input, output, parts).then((code) =>
    endIfAbandoned(parts, output, io, code),
  );
}

async function endIfAbandoned(
  parts: EngineCommandParts,
  output: Writable,
  io: EngineIo,
  code: number,
): Promise<number> {
  if (!parts.abandoned()) return code;
  // The `stopped` frame goes out first: the shell waits for it.
  await new Promise<void>((resolve) => output.write("", () => resolve()));
  (io.exit ?? ((exitCode: number) => process.exit(exitCode)))(code);
  return code;
}
