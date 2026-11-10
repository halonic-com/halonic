import { type ChildProcess, spawn } from "node:child_process";
import { createRequire } from "node:module";
import { Readable, Writable } from "node:stream";

/** A program running inside the fence, as the session sees it. */
export interface RunningProgram {
  stdin: WritableStream<Uint8Array>;
  stdout: ReadableStream<Uint8Array>;
  stderr: ReadableStream<Uint8Array>;
  /** Settles when the program and everything it started has ended. Never rejects. */
  ended: Promise<{ code: number | null; signal: string | null }>;
  /** Ends the program and everything it started, at once. Safe to call twice. */
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
 * group. The program is passed as separate arguments; srt quotes them for the
 * shell it runs inside the fence.
 */
export const srtRunner: Runner = {
  async run(request) {
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
    const ended = new Promise<{ code: number | null; signal: string | null }>((resolve) => {
      child.once("close", (code, signal) => {
        // Whatever the program left behind in the group goes with it.
        killGroup(pid);
        resolve({ code, signal });
      });
    });
    return {
      stdin: Writable.toWeb(child.stdin as Writable) as WritableStream<Uint8Array>,
      stdout: Readable.toWeb(child.stdout as Readable) as ReadableStream<Uint8Array>,
      stderr: Readable.toWeb(child.stderr as Readable) as ReadableStream<Uint8Array>,
      ended,
      killTree: () => killGroup(pid),
    };
  },
};

function killGroup(pid: number | undefined): void {
  if (pid === undefined) return;
  try {
    process.kill(-pid, "SIGKILL");
  } catch {
    // The group has already ended.
  }
}
