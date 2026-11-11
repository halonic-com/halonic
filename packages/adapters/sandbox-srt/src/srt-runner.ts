import { type ChildProcess, execFile, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { realpath } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { Readable, Writable } from "node:stream";
import { promisify } from "node:util";
import { type PathLookup, skillScriptsRefusal, touchesSkillScripts } from "@halonicjs/format";

/** A program running inside the fence, as the session sees it. */
export interface RunningProgram {
  /** What the program reads. */
  stdin: WritableStream<Uint8Array>;
  /** What the program writes. */
  stdout: ReadableStream<Uint8Array>;
  /** What the program writes as errors. */
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
  /** The program, by name or path. */
  program: string;
  /** Its arguments, passed as they are. */
  args: string[];
  /** The folder it starts in. */
  cwd: string;
  /**
   * The whole environment of the launcher, which runs outside the fence: only
   * what it needs to find the sandbox tools. Nothing the program can influence.
   */
  launcherEnv: Record<string, string>;
  /** The variables the program gets on top of what srt sets inside the fence (its proxy variables). Set inside the fence, never for the launcher. */
  programEnv: Record<string, string>;
  /**
   * When true, the program gets none of what srt sets inside the fence, only
   * `programEnv`: for a session that reaches no network, where srt's proxy
   * variables lead nowhere. On Windows, where nothing can empty the
   * environment, {@link srtNetworkVariables} are removed.
   */
  withoutSrtEnv: boolean;
}

/**
 * Every variable srt sets inside the fence to lead a program to its proxy:
 * the usual proxy variables, the ones for git, Docker, rsync and the Google
 * Cloud SDK, and on Windows the one that makes Node read them. A program
 * without network must get none of them. Windows reads names ignoring case,
 * so one spelling each is enough there. A test checks this list against what
 * srt itself generates, so an srt update that adds one fails it.
 */
export const srtNetworkVariables: readonly string[] = [
  "http_proxy",
  "https_proxy",
  "all_proxy",
  "no_proxy",
  "grpc_proxy",
  "ftp_proxy",
  "RSYNC_PROXY",
  "DOCKER_HTTP_PROXY",
  "DOCKER_HTTPS_PROXY",
  "CLOUDSDK_PROXY_TYPE",
  "CLOUDSDK_PROXY_ADDRESS",
  "CLOUDSDK_PROXY_PORT",
  "CLOUDSDK_PROXY_USERNAME",
  "CLOUDSDK_PROXY_PASSWORD",
  "GIT_SSH_COMMAND",
  "SRT_SSH_PROXY_COMMAND",
  "GIT_CONFIG_PARAMETERS",
  "NODE_USE_ENV_PROXY",
];

/**
 * Starts programs inside the fence. A test hands the session a fake one;
 * {@link srtRunner} is the real one.
 */
export interface Runner {
  /** @throws when nothing could be launched. */
  run(request: RunRequest): Promise<RunningProgram>;
}

/** Node's way to find where a path leads, for the shared skill `scripts/` check. */
export const nodePaths: PathLookup = { resolve, realpath };

/** Where the `srt` command line of sandbox-runtime lives. */
function srtCliPath(): string {
  return createRequire(import.meta.url).resolve("@anthropic-ai/sandbox-runtime/dist/cli.js");
}

/**
 * What `cmd.exe` reads inside double quotes as more than text: a quote ends the
 * quoting, `%` starts a variable and a line break ends the command. Nothing
 * escapes them reliably, so a value with one is refused rather than guessed at.
 */
const unquotableOnWindows = /["%\r\n\0]/;

/** `value` as one `cmd.exe` word: in double quotes, with trailing backslashes doubled so they can't escape the closing quote. @throws when the value can't be quoted safely. */
function quoteForCmd(value: string): string {
  if (unquotableOnWindows.test(value)) {
    throw new Error(
      "on Windows, a program, argument or variable can't contain a double quote, a percent sign or a line break",
    );
  }
  return `"${value.replace(/\\+$/, (slashes) => slashes + slashes)}"`;
}

/**
 * The command line srt runs through `cmd.exe` on Windows: the program's
 * variables set first, then the program. There is no `env` or `sh` there, and
 * srt's own argument quoting is for POSIX shells, so the line is built here.
 * The variables are set inside the fence, so none of them reaches the launcher.
 */
export function windowsCommandLine(request: RunRequest): string {
  // `set "NAME="` removes a variable in cmd.exe.
  const removes = request.withoutSrtEnv
    ? srtNetworkVariables.map((name) => `set ${quoteForCmd(`${name}=`)}`)
    : [];
  const sets = Object.entries(request.programEnv).map(([name, value]) => {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
      throw new Error(`a variable name that is not plain: ${name}`);
    }
    return `set ${quoteForCmd(`${name}=${value}`)}`;
  });
  const program = [request.program, ...request.args].map(quoteForCmd).join(" ");
  return [...removes, ...sets, program].join(" && ");
}

/** Ends `pid` and everything under it. Windows has no process groups and no SIGTERM: `taskkill /T /F` is the only way, so there is no grace period. */
function killWindowsTree(pid: number | undefined): void {
  if (pid === undefined) return;
  execFile("taskkill", ["/PID", String(pid), "/T", "/F"], { windowsHide: true }, () => {
    // Already gone, or the program inside the fence has ended with its job.
  });
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
 * group (on Windows, a process tree, which srt's job object holds). It refuses a skill's `scripts/` files before anything starts. The program is passed as separate arguments; srt quotes them for the
 * shell it runs inside the fence.
 */
export const srtRunner: Runner = {
  async run(request) {
    // Checked here too, not only in the session, so no caller of the runner gets round it. The
    // session reads the profile's variables; `programEnv` also holds the safe host `PATH`, which isn't
    // workspace content, so it isn't read here.
    if (await touchesSkillScripts(request, nodePaths)) {
      throw new Error(skillScriptsRefusal);
    }
    const windows = process.platform === "win32";
    const marker = `HALONIC_SRT_RUN=${randomUUID()}`;
    const command = windows
      ? ["-c", windowsCommandLine(request)]
      : [
          "--",
          // `env` sets the program's variables inside the fence, so none of them reaches the launcher.
          // It keeps what srt sets there (the proxy variables the program reaches the network by),
          // unless the session reaches no network: then `-i` starts from an empty environment.
          "env",
          ...(request.withoutSrtEnv ? ["-i"] : []),
          ...Object.entries(request.programEnv).map(([name, value]) => `${name}=${value}`),
          marker,
          request.program,
          ...request.args,
        ];
    const child = spawn(
      process.execPath,
      [srtCliPath(), "--settings", request.settingsPath, ...command],
      {
        cwd: request.cwd,
        env: request.launcherEnv,
        stdio: ["pipe", "pipe", "pipe"],
        // Its own process group, so one signal reaches srt and everything under it. Windows has none.
        detached: !windows,
        windowsHide: true,
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
        if (!windows) killGroup(pid, "SIGKILL");
        void killMarked(marker).then(() => resolve({ code, signal }));
      });
    });
    return {
      stdin: Writable.toWeb(child.stdin as Writable) as WritableStream<Uint8Array>,
      stdout: Readable.toWeb(child.stdout as Readable) as ReadableStream<Uint8Array>,
      stderr: Readable.toWeb(child.stderr as Readable) as ReadableStream<Uint8Array>,
      ended,
      killTree: () => {
        if (gone) return;
        if (windows) return killWindowsTree(pid);
        forceTimer ??= stopGroup(pid, terminationGraceMs, () => void killMarked(marker));
      },
    };
  },
};

/** How long a program gets to end after SIGTERM before it is killed. */
export const terminationGraceMs = 2000;

/** Sends SIGTERM to the group, then SIGKILL after `graceMs`. Returns the timer of the second signal. */
export function stopGroup(
  pid: number | undefined,
  graceMs: number,
  afterForce: () => void = () => {},
): NodeJS.Timeout {
  killGroup(pid, "SIGTERM");
  const timer = setTimeout(() => {
    killGroup(pid, "SIGKILL");
    afterForce();
  }, graceMs);
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

const execFileAsync = promisify(execFile);

/** Most passes of the sweep: a program that keeps starting new detached children can't hold it forever. */
const maxSweepPasses = 20;

/**
 * Kills what a program started and moved out of the process group with
 * `setsid` (a signal to the group can't reach it). On macOS nothing else ties
 * such a process to the session, so it is found by the marker variable every
 * program starts with, which its children inherit. It repeats until a pass
 * finds nothing, because a program that forks as it is killed starts new ones
 * between the list and the kill. A program that clears its own environment
 * before detaching is not found this way (documented in the README).
 */
async function killMarked(marker: string): Promise<void> {
  if (process.platform !== "darwin") return;
  for (let pass = 0; pass < maxSweepPasses; pass++) {
    const pids = await listMarked(marker);
    if (pids.filter(killPid).length === 0) return;
  }
}

/** The processes of this user that carry `marker` (`ps -E` shows their environment). */
async function listMarked(marker: string): Promise<number[]> {
  try {
    const { stdout } = await execFileAsync("ps", ["-Eww", "-ax", "-o", "pid=,command="], {
      encoding: "utf8",
      timeout: 5000,
      maxBuffer: 64 * 1024 * 1024,
    });
    return stdout
      .split("\n")
      .filter((line) => line.includes(` ${marker}`))
      .map((line) => Number.parseInt(line.trim(), 10))
      .filter((pid) => Number.isInteger(pid) && pid !== process.pid);
  } catch {
    return [];
  }
}

function killPid(pid: number): boolean {
  try {
    process.kill(pid, "SIGKILL");
    return true;
  } catch {
    return false; // Already gone.
  }
}
