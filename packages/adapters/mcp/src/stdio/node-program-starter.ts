import { type ChildProcess, spawn } from "node:child_process";
import { realpath } from "node:fs/promises";
import { resolve, win32 } from "node:path";
import { findProgram } from "@halonicjs/adapter-system-node";
import { type PathLookup, skillScriptsRefusal, touchesSkillScripts } from "@halonicjs/format";
import type { ProgramExit, ProgramLaunch, ProgramStarter, RunningProgram } from "./program.ts";

const isWindows = process.platform === "win32";

/** Node's way to find where a path leads, for the shared skill `scripts/` check. */
const nodePaths: PathLookup = { resolve, realpath };

/**
 * Starts a stdio connector's program with Node: array arguments, no shell,
 * and only the environment it is given. A bare program name is first found
 * in the absolute folders of that environment's `PATH` (on Windows only as
 * `<name>.exe`), so neither Node nor Windows ever looks in the current
 * folder. It refuses a program it can't find, and a program, argument,
 * folder or value of `checkedEnv` under a skill's `scripts/` folder, before
 * anything starts.
 *
 * On macOS and Linux the program gets its own process group, so a signal
 * reaches everything it started, such as the server under `npx`, and
 * whatever is left of the group is killed once it ends. On Windows,
 * `taskkill /T` ends the whole process tree.
 */
export const nodeProgramStarter: ProgramStarter = {
  async start(launch) {
    const { cwd, program: named, args, checkedEnv } = launch;
    if (await touchesSkillScripts({ cwd, program: named, args, env: checkedEnv }, nodePaths)) {
      throw new Error(skillScriptsRefusal);
    }
    const program = await absoluteProgram(launch);
    // A PATH folder may be a skill's scripts/ folder too.
    if (await touchesSkillScripts({ cwd: launch.cwd, program, args: [] }, nodePaths)) {
      throw new Error(skillScriptsRefusal);
    }
    const child = spawn(program, [...launch.args], {
      cwd: launch.cwd,
      env: { ...launch.env },
      stdio: ["pipe", "pipe", "pipe"],
      detached: !isWindows,
      windowsHide: true,
      shell: false,
    });
    await launched(child);
    return runningProgram(child);
  },
};

/**
 * The absolute path of the launch's program, found in the `PATH` of the
 * environment the program gets.
 *
 * @throws when no absolute folder of that `PATH` has it
 */
async function absoluteProgram(launch: ProgramLaunch): Promise<string> {
  const path = launch.env["PATH"] ?? launch.env["Path"] ?? "";
  const program = await findProgram(launch.program, { path });
  if (program !== undefined) return program;
  throw new Error(
    `The program ${launch.program} was not found in any absolute folder of the PATH.`,
  );
}

/** Resolves once the child has started, and rejects when it can't be launched. */
function launched(child: ChildProcess): Promise<void> {
  return new Promise((resolve, reject) => {
    child.once("spawn", () => resolve());
    child.once("error", reject);
  });
}

function runningProgram(child: ChildProcess): RunningProgram {
  const { stdin, stdout, stderr, pid } = child;
  if (stdin === null || stdout === null || stderr === null || pid === undefined) {
    throw new Error("The program started without its standard streams.");
  }
  // A write to a program that has ended fails in the write's callback; this keeps it from also throwing.
  stdin.on("error", () => undefined);
  const exited = new Promise<ProgramExit>((resolve) => {
    child.once("close", (code, signal) => {
      // Whatever the program left behind in its group goes with it.
      signalTree(child, pid, "kill");
      resolve({ code, signal });
    });
  });
  return {
    // A write waiting on a full pipe still settles: once the program ends,
    // Node destroys the pipe and fails every pending write's callback.
    write: (text) =>
      new Promise((resolve, reject) => {
        stdin.write(text, (error) => (error ? reject(error) : resolve()));
      }),
    endInput: () => stdin.end(),
    stdout,
    stderr,
    exited,
    signal: (kind) => signalTree(child, pid, kind),
  };
}

function signalTree(child: ChildProcess, pid: number, kind: "terminate" | "kill"): void {
  if (isWindows) {
    windowsTaskkill(child, pid, kind);
    return;
  }
  try {
    process.kill(-pid, kind === "kill" ? "SIGKILL" : "SIGTERM");
  } catch {
    // The group has already ended.
  }
}

/**
 * Ends a process tree on Windows, with taskkill from the system folder,
 * never from PATH. Without a known system folder it can only end the
 * program itself.
 */
function windowsTaskkill(child: ChildProcess, pid: number, kind: "terminate" | "kill"): void {
  const systemRoot = process.env["SystemRoot"] ?? process.env["windir"];
  if (systemRoot === undefined) {
    child.kill(kind === "kill" ? "SIGKILL" : "SIGTERM");
    return;
  }
  const args = ["/PID", String(pid), "/T", ...(kind === "kill" ? ["/F"] : [])];
  const taskkill = spawn(win32.join(systemRoot, "System32", "taskkill.exe"), args, {
    stdio: "ignore",
    windowsHide: true,
  });
  // The tree may already be gone, and then taskkill fails: nothing to do.
  taskkill.on("error", () => undefined);
}
