import { spawn } from "node:child_process";
import { constants } from "node:fs";
import { access, stat } from "node:fs/promises";
import { delimiter, join } from "node:path";
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
        const path = await findProgram(program, env["PATH"] ?? "");
        if (path === null) return { status: "missing" };
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

async function findProgram(name: string, pathList: string): Promise<string | null> {
  const names = process.platform === "win32" ? [`${name}.exe`, `${name}.com`] : [name];
  for (const dir of pathList.split(delimiter)) {
    // An empty or relative entry would mean the current folder; skip it.
    if (!dir.startsWith("/") && !/^[A-Za-z]:[\\/]/.test(dir)) continue;
    for (const candidate of names) {
      const path = join(dir, candidate);
      if (await isExecutableFile(path)) return path;
    }
  }
  return null;
}

async function isExecutableFile(path: string): Promise<boolean> {
  try {
    if (!(await stat(path)).isFile()) return false;
    await access(path, constants.X_OK);
    return true;
  } catch {
    return false;
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
    const out = new Capture();
    const err = new Capture();
    let settled = false;
    const settle = (result: ProgramProbeResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      // A child that outlived the program may still hold the pipes and would keep the launcher alive.
      child.stdout.destroy();
      child.stderr.destroy();
      resolve(result);
    };
    const killGroup = () => {
      try {
        // On POSIX the program leads its own process group, so this also stops what it forked.
        if (child.pid !== undefined && process.platform !== "win32")
          process.kill(-child.pid, "SIGKILL");
        else child.kill("SIGKILL");
      } catch {
        // Already gone.
      }
    };

    const child = spawn(path, [...args], {
      shell: false,
      env,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
      detached: process.platform !== "win32",
    });
    const timer = setTimeout(() => {
      killGroup();
      settle({
        status: "failed",
        path,
        error: `${name} didn't finish in time and was stopped.`,
      });
    }, timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => out.add(chunk));
    child.stderr.on("data", (chunk: Buffer) => err.add(chunk));
    child.on("error", () => {
      settle({ status: "failed", path, error: `${name} was found but couldn't be started.` });
    });
    // The program is done; stop anything it left behind so the pipes can close.
    child.on("exit", killGroup);
    child.on("close", (code) => {
      settle({ status: "ran", path, code, stdout: out.text(), stderr: err.text() });
    });
  });
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
