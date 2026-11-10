import { type ChildProcess, spawn } from "node:child_process";
import { realpath } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { Readable, Writable } from "node:stream";

/** A program running inside the fence, as the session sees it. */
export interface RunningProgram {
  stdin: WritableStream<Uint8Array>;
  stdout: ReadableStream<Uint8Array>;
  stderr: ReadableStream<Uint8Array>;
  /** Settles when the program and everything it started has ended. Never rejects. */
  ended: Promise<{ code: number | null; signal: string | null }>;
  /** Ends the program and everything it started: asks first (SIGTERM), then forces it after a short wait. Safe to call twice. */
  killTree(): void;
}

/** What to run inside the fence. */
export interface RunRequest {
  /** The sandbox-runtime settings file for the session. */
  settingsPath: string;
  program: string;
  args: string[];
  cwd: string;
  /**
   * The whole environment of the launcher, which runs outside the fence: only
   * what it needs to find the sandbox tools. Nothing the program can influence.
   */
  launcherEnv: Record<string, string>;
  /** The variables the program gets on top of what srt sets inside the fence (its proxy variables). Set inside the fence, never for the launcher. */
  programEnv: Record<string, string>;
}

/**
 * Starts programs inside the fence. A test hands the session a fake one;
 * {@link srtRunner} is the real one.
 */
export interface Runner {
  /** @throws when nothing could be launched. */
  run(request: RunRequest): Promise<RunningProgram>;
}

/** A path with a `skills/<name>/scripts` part, in either slash style. */
const skillScripts = /(^|[\\/])skills[\\/][^\\/]+[\\/]scripts([\\/]|$)/;

export const skillScriptsRefusal = "Halonic never runs a file under a skill's scripts/ folder";

/**
 * Whether one part of a start points under a skill's `scripts/` folder: as
 * written, resolved against `cwd`, or through symbolic links to where the file
 * really is, so a link elsewhere doesn't hide a skill's script.
 */
async function pointsAtSkillScripts(cwd: string, part: string): Promise<boolean> {
  const path = resolve(cwd, part);
  if (skillScripts.test(part) || skillScripts.test(path)) return true;
  // A part that isn't a file there (a bare name, a flag) has no link to follow.
  const real = await realpath(path).catch(() => path);
  return skillScripts.test(real);
}

/**
 * Whether the program, an argument or the folder it starts in points under a
 * skill's `scripts/` folder, as written, resolved against `cwd` or through
 * symbolic links. Halonic never runs those files (HAL-188, HAL-3011).
 */
export async function touchesSkillScripts(
  cwd: string,
  program: string,
  args: readonly string[],
): Promise<boolean> {
  for (const part of [cwd, program, ...args]) {
    if (await pointsAtSkillScripts(cwd, part)) return true;
  }
  return false;
}

/** Where the `srt` command line of sandbox-runtime lives. */
function srtCliPath(): string {
  return createRequire(import.meta.url).resolve("@anthropic-ai/sandbox-runtime/dist/cli.js");
}

/** Resolves once the child has started, and rejects when it can't be launched. */
function launched(child: ChildProcess): Promise<void> {
  return new Promise((resolve, reject) => {
    child.once("spawn", () => resolve());
    child.once("error", reject);
  });
}

/**
 * One `srt` process per program. Each has its own proxy and its own settings,
 * so sessions never share state, and ending the program is ending a process
 * group. It refuses a skill's `scripts/` files before anything starts. The program is passed as separate arguments; srt quotes them for the
 * shell it runs inside the fence.
 */
export const srtRunner: Runner = {
  async run(request) {
    // Checked here too, not only in the session, so no caller of the runner gets round it.
    if (await touchesSkillScripts(request.cwd, request.program, request.args)) {
      throw new Error(skillScriptsRefusal);
    }
    const child = spawn(
      process.execPath,
      [
        srtCliPath(),
        "--settings",
        request.settingsPath,
        "--",
        // `env` sets the program's variables inside the fence, so none of them reaches the launcher.
        // It keeps what srt sets there (the proxy variables the program reaches the network by).
        "env",
        ...Object.entries(request.programEnv).map(([name, value]) => `${name}=${value}`),
        request.program,
        ...request.args,
      ],
      {
        cwd: request.cwd,
        env: request.launcherEnv,
        stdio: ["pipe", "pipe", "pipe"],
        // Its own process group, so one signal reaches srt and everything under it.
        detached: true,
      },
    );
    await launched(child);
    const pid = child.pid;
    let forceTimer: NodeJS.Timeout | undefined;
    let gone = false;
    const ended = new Promise<{ code: number | null; signal: string | null }>((resolve) => {
      child.once("close", (code, signal) => {
        // Whatever the program left behind in the group goes with it.
        gone = true;
        clearTimeout(forceTimer);
        killGroup(pid, "SIGKILL");
        resolve({ code, signal });
      });
    });
    return {
      stdin: Writable.toWeb(child.stdin as Writable) as WritableStream<Uint8Array>,
      stdout: Readable.toWeb(child.stdout as Readable) as ReadableStream<Uint8Array>,
      stderr: Readable.toWeb(child.stderr as Readable) as ReadableStream<Uint8Array>,
      ended,
      killTree: () => {
        if (gone) return;
        forceTimer ??= stopGroup(pid, terminationGraceMs);
      },
    };
  },
};

/** How long a program gets to end after SIGTERM before it is killed. */
export const terminationGraceMs = 2000;

/** Sends SIGTERM to the group, then SIGKILL after `graceMs`. Returns the timer of the second signal. */
export function stopGroup(pid: number | undefined, graceMs: number): NodeJS.Timeout {
  killGroup(pid, "SIGTERM");
  const timer = setTimeout(() => killGroup(pid, "SIGKILL"), graceMs);
  timer.unref();
  return timer;
}

function killGroup(pid: number | undefined, signal: "SIGTERM" | "SIGKILL"): void {
  if (pid === undefined) return;
  try {
    process.kill(-pid, signal);
  } catch {
    // The group has already ended.
  }
}
