import { spawn } from "node:child_process";

/** One program to run, and the limits it runs under. */
export interface ProcessCall {
  /** The program's absolute path. */
  program: string;
  /** Its arguments, each passed as it is: no shell ever reads them. */
  args: readonly string[];
  /** The folder it runs in. */
  cwd: string;
  /** Its whole environment; nothing is inherited beyond it. */
  env: Readonly<Record<string, string>>;
  /** Stopped after this many milliseconds. */
  timeoutMs: number;
  /** Stopped once its output and error output together pass this many bytes. */
  maxOutputBytes: number;
}

/** What a finished program gave back. */
export interface ProcessResult {
  /** The exit code, or `null` when it was stopped. */
  code: number | null;
  stdout: Buffer;
  stderr: string;
}

/**
 * Runs one program with no shell and no input, and collects its output.
 *
 * Past its time or output limit the program is stopped together with
 * every program it started (git starts `ssh`, `git-remote-https` and
 * others). On macOS and Linux it gets a process group of its own, which is
 * stopped as one. Windows has no such groups, so there `taskkill /T` stops
 * the program and the tree of programs below it.
 *
 * @throws Error when the program can't start, or passes its time or output limit
 */
export function runProcess(call: ProcessCall): Promise<ProcessResult> {
  return new Promise((resolve, reject) => {
    const ownGroup = process.platform !== "win32";
    const child = spawn(call.program, [...call.args], {
      cwd: call.cwd,
      env: call.env,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
      detached: ownGroup,
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let outputBytes = 0;
    let stopReason: string | null = null;

    const stop = (reason: string): void => {
      if (stopReason !== null) return;
      stopReason = reason;
      stopAll(child.pid, process.platform, () => child.kill("SIGKILL"));
    };
    const timer = setTimeout(() => stop(`took longer than ${call.timeoutMs} ms`), call.timeoutMs);
    const collect = (into: Buffer[]) => (chunk: Buffer) => {
      outputBytes += chunk.length;
      if (outputBytes > call.maxOutputBytes) {
        stop(`gave more than ${call.maxOutputBytes} bytes of output`);
        return;
      }
      into.push(chunk);
    };
    child.stdout.on("data", collect(stdout));
    child.stderr.on("data", collect(stderr));

    child.on("error", (error) => {
      clearTimeout(timer);
      reject(new Error(`Couldn't start ${call.program}: ${error.message}`, { cause: error }));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (stopReason !== null) {
        reject(new Error(`${call.program} was stopped: it ${stopReason}.`));
        return;
      }
      resolve({
        code,
        stdout: Buffer.concat(stdout),
        stderr: Buffer.concat(stderr).toString("utf8"),
      });
    });
  });
}

/** Stops the program and every program it started, the way the platform allows. */
function stopAll(pid: number | undefined, platform: NodeJS.Platform, stopChild: () => void): void {
  if (pid === undefined) {
    stopChild();
    return;
  }
  if (platform === "win32") {
    stopTree(pid, stopChild);
    return;
  }
  try {
    process.kill(-pid, "SIGKILL");
  } catch {
    // The group has already gone; stop the program itself in case it hasn't.
    stopChild();
  }
}

/**
 * Stops the Windows process `pid` and its tree with `taskkill`. The program
 * itself is stopped as well whatever `taskkill` says, so a `taskkill` that
 * can't start or finds nothing never leaves it running.
 */
function stopTree(pid: number, stopChild: () => void): void {
  const { program, args } = windowsTreeStop(pid, process.env["SystemRoot"]);
  const taskkill = spawn(program, args, { shell: false, stdio: "ignore", windowsHide: true });
  taskkill.on("error", stopChild);
  taskkill.on("close", stopChild);
}

/**
 * The `taskkill` call that stops `pid` and every program below it, by its
 * full path under the Windows folder: Windows looks in the current folder
 * first for a bare program name.
 *
 * @param windowsFolder - the Windows folder, from the `SystemRoot` variable
 */
export function windowsTreeStop(
  pid: number,
  windowsFolder: string | undefined,
): { program: string; args: string[] } {
  // Windows always sets SystemRoot; the usual folder stands in if a caller cleared it.
  const folder = windowsFolder ?? "C:\\Windows"; // leak-guard: allow absolute-path Windows' own install folder
  return {
    program: `${folder}\\System32\\taskkill.exe`,
    args: ["/PID", String(pid), "/T", "/F"],
  };
}
