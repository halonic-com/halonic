import { type ChildProcess, type ChildProcessByStdio, spawn } from "node:child_process";
import type { Readable } from "node:stream";
import { findProgram } from "@halonicjs/adapter-system-node";
import type { ProgramProbe, ProgramProbeResult } from "@halonicjs/ports";

const defaultTimeoutMs = 5_000;
const maxOutputBytes = 4_096;
const allowedEnv = ["PATH", "HOME", "LANG", "LC_ALL", "LC_CTYPE", "LC_MESSAGES"] as const;

/** What {@link createProgramProbe} may be told. */
export interface ProgramProbeOptions {
  /** The launcher's environment; defaults to `process.env`. Only `PATH`, `HOME` and the locale are passed on. */
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
    async ask(program, args) {
      try {
        if (program === "" || /[\\/]/.test(program)) return { status: "missing" };
        // Only absolute PATH folders, never the current one; on Windows only `<name>.exe`.
        const path = await findProgram(program, { path: env["PATH"] ?? "" });
        if (path === undefined) return { status: "missing" };
        return await run(program, path, args, childEnv(env), timeoutMs);
      } catch {
        return { status: "failed", path: program, error: `${program} couldn't be asked.` };
      }
    },
  };
}

function childEnv(env: Readonly<Record<string, string | undefined>>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const key of allowedEnv) {
    const value = env[key];
    if (value !== undefined) result[key] = value;
  }
  return result;
}

const liveProbes = new Set<ChildProcess>();

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

function killLiveProbes(): void {
  for (const child of liveProbes) killGroup(child);
  liveProbes.clear();
}

const onSigint = () => onLauncherSignal("SIGINT");
const onSigterm = () => onLauncherSignal("SIGTERM");

function onLauncherSignal(signal: NodeJS.Signals): void {
  killLiveProbes();
  unwatchLauncher();
  // With no other listener the signal would have ended the launcher, so let it. With one, that
  // listener has this signal already and re-raising would show it a second Ctrl-C.
  if (process.listenerCount(signal) === 0) process.kill(process.pid, signal);
}

function watchLauncher(): void {
  process.on("exit", killLiveProbes);
  process.on("SIGINT", onSigint);
  process.on("SIGTERM", onSigterm);
}

function unwatchLauncher(): void {
  process.off("exit", killLiveProbes);
  process.off("SIGINT", onSigint);
  process.off("SIGTERM", onSigterm);
}

/** The program has its own process group, so Ctrl-C on the launcher no longer reaches it; stop it on the way out. */
function track(child: ChildProcess): () => void {
  if (liveProbes.size === 0) watchLauncher();
  liveProbes.add(child);
  return () => {
    liveProbes.delete(child);
    if (liveProbes.size === 0) unwatchLauncher();
  };
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
    const child = start(path, args, env);
    if (child === null) {
      resolve(cantStart);
      return;
    }
    const out = new Capture();
    const err = new Capture();
    const untrack = track(child);
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
