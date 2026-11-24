import { execFile } from "node:child_process";
import { basename } from "node:path";
import { findProgram } from "@halonicjs/adapter-system-node";

/** What one call of the `tailscale` command gave back. */
export type TailscaleReply =
  | {
      readonly kind: "done";
      readonly code: number;
      readonly stdout: string;
      readonly stderr: string;
    }
  /** No `tailscale` program was found. */
  | { readonly kind: "missing" }
  /** It couldn't start, passed its time or output limit, or was stopped; `why` is one plain sentence. */
  | { readonly kind: "failed"; readonly why: string };

/** Runs the `tailscale` command with one argument list. Every call ends: it has a time limit. */
export interface TailscaleRunner {
  run(args: readonly string[]): Promise<TailscaleReply>;
}

/** What {@link nodeTailscaleRunner} may be told. */
export interface NodeTailscaleRunnerOptions {
  /** The program: a bare name looked up on `PATH`, or an absolute path. Defaults to `tailscale`. */
  program?: string;
  /** The launcher's environment; defaults to `process.env`. Only the variables the CLI needs are passed on. */
  env?: Readonly<Record<string, string | undefined>>;
  /** How long one call may run before it is killed. Defaults to 10 seconds. */
  timeoutMs?: number;
}

const defaultTimeoutMs = 10_000;
const maxOutputBytes = 1_048_576;

/**
 * The variables the CLI needs to find its daemon, by name. Nothing else of
 * the launcher's environment (tokens, keys) reaches a program we don't own.
 */
const passedEnv = ["PATH", "HOME", "USERPROFILE", "SystemRoot", "LANG", "LC_ALL"] as const;

/**
 * The real {@link TailscaleRunner}: finds the program on `PATH` (absolute
 * folders only) and runs it with no shell, a small environment, a time
 * limit and an output limit. A call past either limit is killed and
 * answers `failed`, so a hung `tailscale` never becomes an endless wait.
 *
 * @example
 * const reply = await nodeTailscaleRunner().run(["version"]);
 */
export function nodeTailscaleRunner(options: NodeTailscaleRunnerOptions = {}): TailscaleRunner {
  const env = options.env ?? process.env;
  const program = options.program ?? "tailscale";
  const timeoutMs = options.timeoutMs ?? defaultTimeoutMs;
  return {
    async run(args) {
      if (!isTailscaleProgram(program)) return { kind: "missing" };
      const path = await findProgram(program, { path: env["PATH"] ?? "" });
      if (path === undefined) return { kind: "missing" };
      return runProgram(path, args, childEnv(env), timeoutMs);
    },
  };
}

/** The names the Tailscale CLI goes by: the plain program, and the macOS app's own binary. */
const tailscaleNames = new Set(["tailscale", "tailscale.exe"]);

/**
 * Whether `program` names the Tailscale CLI and nothing else: its file name
 * is `tailscale` and no folder of its path is a `scripts` folder, so a
 * skill's script is never started, even one named after it.
 */
export function isTailscaleProgram(program: string): boolean {
  const folders = program.split(/[\\/]/).slice(0, -1);
  if (folders.some((folder) => folder.toLowerCase() === "scripts")) return false;
  return tailscaleNames.has(basename(program.replaceAll("\\", "/")).toLowerCase());
}

/** The launcher's variables the CLI needs, and no others. Internal; exported for its test. */
export function childEnv(
  env: Readonly<Record<string, string | undefined>>,
): Record<string, string> {
  const passed: Record<string, string> = {};
  for (const name of passedEnv) {
    const value = env[name];
    if (value !== undefined) passed[name] = value;
  }
  return passed;
}

/**
 * Runs the program at `path` once, with no shell and no window, and answers
 * `failed` past the time or output limit. Internal; exported for its test.
 */
export function runProgram(
  path: string,
  args: readonly string[],
  env: Record<string, string>,
  timeoutMs: number,
): Promise<TailscaleReply> {
  return new Promise((resolve) => {
    const options = {
      env,
      shell: false,
      timeout: timeoutMs,
      killSignal: "SIGKILL" as const,
      maxBuffer: maxOutputBytes,
      encoding: "utf8" as const,
    };
    execFile(path, [...args], { ...options, windowsHide: true }, (error, stdout, stderr) => {
      if (error === null) {
        resolve({ kind: "done", code: 0, stdout, stderr });
        return;
      }
      resolve(replyFor(error, stdout, stderr, timeoutMs));
    });
  });
}

type ExecError = Error & { code?: unknown; killed?: boolean };

function replyFor(
  error: ExecError,
  stdout: string,
  stderr: string,
  timeoutMs: number,
): TailscaleReply {
  if (error.killed === true) {
    return { kind: "failed", why: `tailscale didn't answer within ${timeoutMs} ms.` };
  }
  if (typeof error.code === "number") return { kind: "done", code: error.code, stdout, stderr };
  if (error.code === "ENOENT") return { kind: "missing" };
  return { kind: "failed", why: `tailscale couldn't be run: ${error.message}` };
}
