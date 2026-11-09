import type { CliIo } from "../command.ts";

/** A {@link CliIo} that keeps what a command prints, for tests. */
export interface CapturedIo extends CliIo {
  readonly stdout: string[];
  readonly stderr: string[];
}

/** An io that works from `cwd` and keeps every line printed. */
export function captureIo(cwd: string): CapturedIo {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    cwd,
    stdout,
    stderr,
    out: (line) => stdout.push(line),
    err: (line) => stderr.push(line),
  };
}
