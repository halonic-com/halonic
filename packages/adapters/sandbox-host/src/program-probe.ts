import { type ChildProcess, type ChildProcessByStdio, spawn } from "node:child_process";
import { isAbsolute } from "node:path";
import type { Readable } from "node:stream";
import { findProgram } from "@halonicjs/adapter-system-node";
import type { ProgramProbe, ProgramProbeResult, ProgramSettingsFolder } from "@halonicjs/ports";
import { stopOnLauncherExit } from "./launcher-exit.ts";

const defaultTimeoutMs = 5_000;
const maxOutputBytes = 4_096;
const allowedEnv = ["PATH", "HOME", "LANG", "LC_ALL", "LC_CTYPE", "LC_MESSAGES"] as const;

/**
 * The variables that point a harness's program at an agent's settings
 * folder, by name: Claude Code's and Codex's. A question may set one of
 * these and nothing else, so the probe has no door for other variables.
 */
const settingsFolderVariables: ReadonlySet<string> = new Set(["CLAUDE_CONFIG_DIR", "CODEX_HOME"]);

/** What {@link createProgramProbe} may be told. */
export interface ProgramProbeOptions {
  /**
   * The launcher's environment; defaults to `process.env`. Only `PATH`,
   * `HOME` and the locale are passed on, plus a question's settings folder.
   */
  env?: Readonly<Record<string, string | undefined>>;
  /** How long a program may run before it is killed; defaults to 5 seconds. */
  timeoutMs?: number;
}

/**
 * The real {@link ProgramProbe} on Node (requirement `sandbox-host.program-probe-node`).
 *
 * @example
 * const answer = await createProgramProbe().ask("claude", ["--version"]);
 */
export function createProgramProbe(options: ProgramProbeOptions = {}): ProgramProbe {
  const env = options.env ?? process.env;
  const timeoutMs = options.timeoutMs ?? defaultTimeoutMs;
  return {
    async ask(program, args, question = {}) {
      try {
        if (program === "" || /[\\/]/.test(program)) return { status: "missing" };
        // Only absolute PATH folders, never the current one; on Windows only `<name>.exe`.
        const path = await findProgram(program, { path: env["PATH"] ?? "" });
        if (path === undefined) return { status: "missing" };
        const { settingsFolder } = question;
        if (settingsFolder !== undefined && !isKnownFolder(settingsFolder)) {
          return { status: "failed", path, error: `${program} can't be asked about that folder.` };
        }
        return await run(program, path, args, childEnv(env, settingsFolder), timeoutMs);
      } catch {
        return { status: "failed", path: program, error: `${program} couldn't be asked.` };
      }
    },
  };
}

/** A settings folder the probe may point a program at: a listed variable and an absolute path. */
function isKnownFolder({ variable, path }: ProgramSettingsFolder): boolean {
  return settingsFolderVariables.has(variable) && isAbsolute(path);
}

function childEnv(
  env: Readonly<Record<string, string | undefined>>,
  settingsFolder: ProgramSettingsFolder | undefined,
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const key of allowedEnv) {
    const value = env[key];
    if (value !== undefined) result[key] = value;
  }
  if (settingsFolder !== undefined) result[settingsFolder.variable] = settingsFolder.path;
  return result;
}

/** On POSIX the program leads its own process group, so this also stops what it forked. */
function killGroup(child: ChildProcess): void {
  try {
    if (child.pid !== undefined && process.platform !== "win32")
      process.kill(-child.pid, "SIGKILL");
    else child.kill("SIGKILL");
  } catch {
    // Already gone.
  }
}

function run(
  name: string,
  path: string,
  args: readonly string[],
  env: Record<string, string>,
  timeoutMs: number,
): Promise<ProgramProbeResult> {
  return new Promise((resolve) => {
    const cantStart: ProgramProbeResult = {
      status: "failed",
      path,
      error: `${name} was found but couldn't be started.`,
    };
    // Set once the program has started.
    let running: ChildProcess | null = null;
    const untrack = stopOnLauncherExit(() => {
      if (running !== null) killGroup(running);
    });
    const child = start(path, args, env);
    if (child === null) {
      untrack();
      resolve(cantStart);
      return;
    }
    running = child;
    const out = new Capture();
    const err = new Capture();
    let settled = false;
    const settle = (result: ProgramProbeResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      untrack();
      // A child that outlived the program may still hold the pipes and would keep the launcher alive.
      child.stdout.destroy();
      child.stderr.destroy();
      resolve(result);
    };
    const timer = setTimeout(() => {
      killGroup(child);
      settle({
        status: "failed",
        path,
        error: `${name} didn't finish in time and was stopped.`,
      });
    }, timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => out.add(chunk));
    child.stderr.on("data", (chunk: Buffer) => err.add(chunk));
    child.on("error", () => settle(cantStart));
    // The program is done; stop anything it left behind so the pipes can close.
    child.on("exit", () => killGroup(child));
    child.on("close", (code) => {
      settle({ status: "ran", path, code, stdout: out.text(), stderr: err.text() });
    });
  });
}

/** Windows throws from `spawn` for an image it can't start; POSIX reports that as an `error` event. */
function start(
  path: string,
  args: readonly string[],
  env: Record<string, string>,
): ChildProcessByStdio<null, Readable, Readable> | null {
  try {
    return spawn(path, [...args], {
      shell: false,
      env,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
      detached: process.platform !== "win32",
    });
  } catch {
    return null;
  }
}

/** Keeps the first {@link maxOutputBytes} bytes and drops the rest. */
class Capture {
  private chunks: Buffer[] = [];
  private size = 0;

  add(chunk: Buffer): void {
    const room = maxOutputBytes - this.size;
    if (room <= 0) return;
    const part = chunk.length > room ? chunk.subarray(0, room) : chunk;
    this.chunks.push(part);
    this.size += part.length;
  }

  text(): string {
    return Buffer.concat(this.chunks).toString("utf8");
  }
}
