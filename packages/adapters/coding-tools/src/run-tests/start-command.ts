// The one place the coding tools start a program: `run_tests`'s command,
// which a person approved on the approval card exactly as written
// (HAL-16748). It runs inside the same fence as the agent, with the
// agent's rights, so it can do nothing the agent's own shell couldn't.

import { spawn } from "node:child_process";
import { open, realpath } from "node:fs/promises";
import { resolve } from "node:path";
import type { Readable } from "node:stream";
import { skillScriptsRefusal, touchesSkillScripts } from "@halonicjs/format";

/** What to run, and how. */
export interface CommandStart {
  /** The command as approved; the platform's shell reads it. */
  readonly command: string;
  readonly cwd: string;
  /** Its whole environment; nothing is inherited beyond it. */
  readonly env: Readonly<Record<string, string>>;
  /** A new file that gets everything it prints, standard output and error together. */
  readonly logFile: string;
  /** The most bytes the log keeps; what comes after is read and dropped. */
  readonly maxLogBytes: number;
  readonly timeoutMs: number;
  /** Stops it when the call is cancelled. */
  readonly signal: AbortSignal;
}

/** How a command ended. */
export interface CommandEnd {
  /** Its exit code, or `null` when it was stopped. */
  readonly exitCode: number | null;
  /** Why Halonic stopped it, or `null` when it ended by itself. */
  readonly stoppedBecause: "timeout" | "cancelled" | null;
  /** Whether the log was cut at `maxLogBytes`. */
  readonly logCut: boolean;
}

/** How long the output may stay open after the command exits, for what it printed last. */
const outputGraceMs = 2_000;

/**
 * Runs the command in the platform's shell (requirement
 * `coding-tools.run-tests`), after refusing one that names a file under a
 * skill's `scripts/` folder. Its input is empty, so it never reads the MCP
 * messages on the server's own input, and its output goes only to the log
 * file, never to the server's output, where it would mix with them. On
 * macOS and Linux it gets a process group of its own; at a timeout, a
 * cancel, and once it has exited, the whole group is stopped, so nothing it
 * left behind keeps running. Windows has no such groups: there `taskkill /T`
 * stops its tree at a timeout or a cancel.
 *
 * @throws Error when it names a skill's `scripts/` folder, or can't start
 */
export async function runCommand(start: CommandStart): Promise<CommandEnd> {
  const shellStart = { cwd: start.cwd, program: "sh", args: ["-c", start.command] };
  if (await touchesSkillScripts(shellStart, { resolve, realpath })) {
    throw new Error(`${skillScriptsRefusal}.`);
  }
  const log = await open(start.logFile, "wx");
  try {
    return await runWithLog(start, log);
  } finally {
    await log.close();
  }
}

type LogFile = Awaited<ReturnType<typeof open>>;

function runWithLog(start: CommandStart, log: LogFile): Promise<CommandEnd> {
  return new Promise((done, fail) => {
    const ownGroup = process.platform !== "win32";
    const child = spawn(start.command, {
      cwd: start.cwd,
      env: start.env,
      shell: true,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
      detached: ownGroup,
    });
    let stoppedBecause: CommandEnd["stoppedBecause"] = null;
    const stop = (reason: "timeout" | "cancelled"): void => {
      stoppedBecause ??= reason;
      stopAll(child.pid, () => child.kill("SIGKILL"));
    };
    const timer = setTimeout(() => stop("timeout"), start.timeoutMs);
    const onAbort = (): void => stop("cancelled");
    start.signal.addEventListener("abort", onAbort, { once: true });
    // A cancel that came while the skill check ran has no event left to fire.
    if (start.signal.aborted) onAbort();
    const writer = new CappedLog(log, start.maxLogBytes);
    child.stdout.on("data", (chunk: Buffer) => writer.write(chunk));
    child.stderr.on("data", (chunk: Buffer) => writer.write(chunk));
    const cleanUp = (): void => {
      clearTimeout(timer);
      start.signal.removeEventListener("abort", onAbort);
    };
    child.on("error", (error) => {
      cleanUp();
      fail(new Error(`The test command couldn't start: ${error.message}`, { cause: error }));
    });
    child.on("exit", (code) => {
      cleanUp();
      // What it started in the background is stopped with it.
      if (ownGroup) stopGroup(child.pid);
      void outputEnded(child.stdout, child.stderr)
        .then(() => writer.finished())
        .then(() =>
          done({
            exitCode: stoppedBecause === null ? code : null,
            stoppedBecause,
            logCut: writer.cut,
          }),
        )
        .catch(fail);
    });
  });
}

/** Writes output to the log in order, up to a number of bytes. */
class CappedLog {
  readonly #log: LogFile;
  #room: number;
  #writes: Promise<unknown> = Promise.resolve();
  cut = false;

  constructor(log: LogFile, maxBytes: number) {
    this.#log = log;
    this.#room = maxBytes;
  }

  write(chunk: Buffer): void {
    if (this.#room <= 0) {
      this.cut ||= chunk.length > 0;
      return;
    }
    const kept = chunk.subarray(0, this.#room);
    this.cut ||= kept.length < chunk.length;
    this.#room -= kept.length;
    this.#writes = this.#writes.then(() => this.#log.write(kept));
  }

  /** Waits for every write. */
  async finished(): Promise<void> {
    await this.#writes;
  }
}

/** Waits until both outputs end, for at most {@link outputGraceMs}; then lets them go. */
function outputEnded(...outputs: Readable[]): Promise<void> {
  // An output that closed before the command's exit was seen has nothing left to wait for.
  const ended = outputs.map((output) =>
    output.closed
      ? Promise.resolve()
      : new Promise<void>((resolveEnd) => output.once("close", () => resolveEnd())),
  );
  return new Promise((resolveAll) => {
    const timer = setTimeout(() => {
      for (const output of outputs) output.destroy();
      resolveAll();
    }, outputGraceMs);
    void Promise.all(ended).then(() => {
      clearTimeout(timer);
      resolveAll();
    });
  });
}

/** Stops the command and everything it started, the way the platform allows. */
function stopAll(pid: number | undefined, stopChild: () => void): void {
  if (pid === undefined) {
    stopChild();
    return;
  }
  if (process.platform === "win32") {
    stopWindowsTree(pid, stopChild);
    return;
  }
  if (!stopGroup(pid)) stopChild();
}

/** Stops a process group; `false` when it had already gone. */
function stopGroup(pid: number | undefined): boolean {
  if (pid === undefined) return false;
  try {
    process.kill(-pid, "SIGKILL");
    return true;
  } catch {
    // Nothing left in the group.
    return false;
  }
}

/**
 * Stops the Windows process `pid` and its tree with `taskkill`, by its full
 * path, as the git adapter does. The command itself is stopped whatever
 * `taskkill` says.
 */
function stopWindowsTree(pid: number, stopChild: () => void): void {
  const windowsFolder = process.env["SystemRoot"] ?? "C:\\Windows"; // leak-guard: allow absolute-path Windows' own install folder
  const taskkill = spawn(
    `${windowsFolder}\\System32\\taskkill.exe`,
    ["/PID", String(pid), "/T", "/F"],
    {
      shell: false,
      stdio: "ignore",
      windowsHide: true,
    },
  );
  taskkill.on("error", stopChild);
  taskkill.on("close", stopChild);
}
