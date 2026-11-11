// Starts one program on this computer, without a fence, for a launcher
// session. The program gets only the variables it is given, never the
// launcher's own, and leads its own process group (on Windows, a process
// tree), so stopping it stops everything it started.

import { type ChildProcess, execFile, execFileSync, spawn } from "node:child_process";
import { realpath } from "node:fs/promises";
import { resolve } from "node:path";
import { Readable, Writable } from "node:stream";
import { type PathLookup, skillScriptsRefusal, touchesSkillScripts } from "@halonicjs/format";
import { stopOnLauncherExit } from "./launcher-exit.ts";

/** Node's way to find where a path leads, for the shared skill `scripts/` check. */
export const nodePaths: PathLookup = { resolve, realpath };

/** How a program ended, before the session adds why. */
export interface HostEnd {
  code: number | null;
  signal: string | null;
}

/** A program the launcher started. */
export interface HostProgram {
  stdin: WritableStream<Uint8Array>;
  stdout: ReadableStream<Uint8Array>;
  stderr: ReadableStream<Uint8Array>;
  /** Settles when the program has ended and what it left in its group is killed. Never rejects. */
  ended: Promise<HostEnd>;
  /** Asks the program and its group to end (SIGTERM), and forces it after a short wait. Safe to call twice. */
  stop(): void;
}

/** What to start: an absolute program path, its arguments, its folder and its whole environment. */
export interface HostStart {
  path: string;
  args: readonly string[];
  cwd: string;
  env: Readonly<Record<string, string>>;
}

/** How long a program gets to end after SIGTERM before it is killed. */
export const stopGraceMs = 2_000;

/**
 * The exit code of a program that couldn't be found or started, as a shell
 * reports it. The `Sandbox` port has a missing program end with a non-zero
 * code rather than throw, the same as inside the fence.
 */
export const cantStartCode = 127;

const windows = process.platform === "win32";

/**
 * Starts `start.path` with no shell. A program that can't start ends at
 * once with {@link cantStartCode}.
 *
 * @throws when the program, an argument, an `env` value or the folder is under a skill's `scripts/` folder; nothing starts
 */
export async function startHostProgram(start: HostStart): Promise<HostProgram> {
  // Checked here too, not only in the session, so no caller gets round it.
  const named = { cwd: start.cwd, program: start.path, args: start.args, env: start.env };
  if (await touchesSkillScripts(named, nodePaths)) {
    throw new Error(skillScriptsRefusal);
  }
  let child: ChildProcess | null = null;
  // Runs during the launcher's `exit`, when nothing asynchronous runs any more.
  const forget = stopOnLauncherExit(() => {
    if (child !== null) killTreeNow(child);
  });
  try {
    child = spawn(start.path, [...start.args], {
      cwd: start.cwd,
      env: { ...start.env },
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
      // Its own process group, so one signal reaches everything it started. Windows has none.
      detached: !windows,
    });
    await launched(child);
  } catch {
    forget();
    if (child !== null) killTree(child, "SIGKILL");
    return programThatCouldNotStart();
  }
  return running(child, forget);
}

function running(child: ChildProcess, forget: () => void): HostProgram {
  let forceTimer: NodeJS.Timeout | undefined;
  let gone = false;
  // Whatever the program left behind in its group goes as soon as the program
  // itself ends, not once its output closes: a child it left running could
  // hold that open until the time limit. Windows ties no tree to a process
  // that has ended, and its id may be reused.
  child.once("exit", () => {
    gone = true;
    clearTimeout(forceTimer);
    if (!windows) killTree(child, "SIGKILL");
  });
  const ended = new Promise<HostEnd>((resolve) => {
    child.once("close", (code, signal) => {
      forget();
      resolve({ code, signal });
    });
  });
  return {
    stdin: Writable.toWeb(child.stdin as Writable) as WritableStream<Uint8Array>,
    stdout: Readable.toWeb(child.stdout as Readable) as ReadableStream<Uint8Array>,
    stderr: Readable.toWeb(child.stderr as Readable) as ReadableStream<Uint8Array>,
    ended,
    stop: () => {
      if (gone || forceTimer !== undefined) return;
      // Windows has no SIGTERM: `taskkill /F` is the only way, so there is no grace period.
      killTree(child, "SIGTERM");
      forceTimer = setTimeout(() => killTree(child, "SIGKILL"), stopGraceMs);
      forceTimer.unref();
    },
  };
}

/** Resolves once the child has started, and rejects when it can't be launched. */
function launched(child: ChildProcess): Promise<void> {
  return new Promise((resolve, reject) => {
    child.once("spawn", () => resolve());
    child.once("error", reject);
  });
}

/** Ends the program's process group, on Windows its process tree. Never throws. */
function killTree(child: ChildProcess, signal: "SIGTERM" | "SIGKILL"): void {
  const pid = child.pid;
  if (pid === undefined) return;
  if (windows) {
    execFile("taskkill", ["/PID", String(pid), "/T", "/F"], { windowsHide: true }, () => {
      // Already gone.
    });
    return;
  }
  try {
    process.kill(-pid, signal);
  } catch {
    // The group has already ended.
  }
}

/**
 * Ends the program's process group, on Windows its process tree, before it
 * returns, for the launcher's `exit`. Never throws.
 */
function killTreeNow(child: ChildProcess): void {
  const pid = child.pid;
  if (pid === undefined) return;
  if (!windows) {
    killTree(child, "SIGKILL");
    return;
  }
  try {
    execFileSync("taskkill", ["/PID", String(pid), "/T", "/F"], {
      windowsHide: true,
      stdio: "ignore",
      timeout: stopGraceMs,
    });
  } catch {
    // Already gone.
  }
}

/** A program that ended before it began: empty output, and {@link cantStartCode}. */
export function programThatCouldNotStart(): HostProgram {
  const empty = () =>
    new ReadableStream<Uint8Array>({
      start(controller) {
        controller.close();
      },
    });
  return {
    stdin: new WritableStream<Uint8Array>(),
    stdout: empty(),
    stderr: empty(),
    ended: Promise.resolve({ code: cantStartCode, signal: null }),
    stop: () => {},
  };
}
