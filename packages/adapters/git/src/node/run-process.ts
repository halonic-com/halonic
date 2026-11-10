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
 * The program gets a process group of its own where the platform has them,
 * so that past its time or output limit it is stopped together with every
 * program it started (git starts `ssh`, `git-remote-https` and others).
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
      stopAll(child.pid, ownGroup, () => child.kill("SIGKILL"));
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

/** Stops the program's whole process group, or the program alone where there are no groups. */
function stopAll(pid: number | undefined, ownGroup: boolean, stopChild: () => void): void {
  if (!ownGroup || pid === undefined) {
    stopChild();
    return;
  }
  try {
    process.kill(-pid, "SIGKILL");
  } catch {
    // The group has already gone; stop the program itself in case it hasn't.
    stopChild();
  }
}
