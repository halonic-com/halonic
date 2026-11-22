import { type ExecFileException, execFile } from "node:child_process";

/** One program run: no shell, its own small environment and a time limit. */
export interface Command {
  readonly program: string;
  readonly args: readonly string[];
  readonly env: Readonly<Record<string, string>>;
  readonly timeoutMs: number;
}

/** How a program run ended: with an exit code, or stopped at its time limit. */
export type CommandResult =
  | {
      readonly kind: "exited";
      readonly code: number;
      readonly stdout: string;
      readonly stderr: string;
    }
  | { readonly kind: "timed-out" };

/** Runs a program. The seats plugin's reads take one, so tests hand in a made-up one. */
export type CommandRunner = (command: Command) => Promise<CommandResult>;

/** The most output a read keeps; `/usage` and `auth status` print far less. */
const maxOutputBytes = 256 * 1024;

/**
 * Runs the program straight, without a shell, with only the environment the
 * command names: none of the worker's own variables reach the program.
 */
export const runCommand: CommandRunner = (command) =>
  new Promise((resolve) => {
    execFile(
      command.program,
      [...command.args],
      {
        env: { ...command.env },
        timeout: command.timeoutMs,
        killSignal: "SIGKILL",
        maxBuffer: maxOutputBytes,
        encoding: "utf8",
        windowsHide: true,
      },
      (error, stdout, stderr) => {
        const tooMuchOutput = error?.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER";
        if (error?.killed && !tooMuchOutput) {
          resolve({ kind: "timed-out" });
          return;
        }
        resolve({ kind: "exited", code: exitCode(error), stdout, stderr });
      },
    );
  });

/** A missing program or too much output has a text code ("ENOENT"); it counts as a failed run. */
function exitCode(error: ExecFileException | null): number {
  if (error === null) {
    return 0;
  }
  return typeof error.code === "number" ? error.code : 127;
}
