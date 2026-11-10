import { type ExecFileException, execFile } from "node:child_process";

/** What a program run outside the sandbox answered. Kept in memory for one fact; never printed. */
export interface OutsideAnswer {
  /** The exit code, or `null` when a signal or a failed start ended it. */
  code: number | null;
  stdout: string;
  stderr: string;
}

/** Runs a program outside the sandbox, as the person, and gives back its exit code and output. */
export type AskOutside = (
  program: string,
  args: string[],
  env: Record<string, string>,
) => Promise<OutsideAnswer>;

/** How long a question outside the sandbox may take. */
const outsideTimeoutMs = 60_000;

/** Runs a program as the person, outside the sandbox, with only the variables given. */
export const askOutside: AskOutside = (program, args, env) =>
  new Promise((done) => {
    execFile(program, args, { env, timeout: outsideTimeoutMs }, (error, stdout, stderr) => {
      done({ code: exitCode(error), stdout, stderr });
    });
  });

/** The exit code `execFile` reports: 0 without an error, `null` when a signal or a failed start ended it. */
function exitCode(error: ExecFileException | null): number | null {
  if (error === null) return 0;
  return typeof error.code === "number" ? error.code : null;
}
