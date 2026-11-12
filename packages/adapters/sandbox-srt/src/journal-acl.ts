import { execFile } from "node:child_process";

/** The SIDs of the system and of the Administrators group, which a new folder's default access list names. */
const defaultEntries = ["S-1-5-18", "S-1-5-32-544"];

/**
 * What {@link restrictToThisUser} starts; a test hands in a fake. `limitMs`
 * is how long it may run, {@link runLimitMs} when left out.
 */
export type RunProgram = (
  file: string,
  args: string[],
  limitMs?: number,
) => Promise<{ stdout: string }>;

/** The system folder, from the environment Windows always sets. */
function system32(): string {
  const root = process.env["SystemRoot"];
  if (root === undefined) throw new Error("SystemRoot is not set");
  return `${root}\\System32`;
}

/** How long a program of the system folder may run before it is stopped, unless the caller gives a limit of its own. */
export const runLimitMs = 15_000;

/** How a program of the system folder ended, when it failed. */
export interface FixedRunFailure {
  /** Its exit code; `null` when it was stopped. */
  code: number | null;
  /** Whether it was stopped because it ran past its time limit. */
  stopped: boolean;
  /** The time limit it had. */
  limitMs: number;
  stdout: string;
  stderr: string;
}

/**
 * The message for a failed program: how it ended and what it printed, so a
 * failure on a machine nobody can watch (a CI runner) says why (HAL-7431).
 */
export function fixedRunFailure(
  file: string,
  args: readonly string[],
  failure: FixedRunFailure,
): string {
  const ended = failure.stopped
    ? `was stopped after ${failure.limitMs / 1000} s`
    : `ended with exit code ${failure.code ?? "unknown"}`;
  const printed = [failure.stderr.trim(), failure.stdout.trim()].filter((text) => text !== "");
  const output = printed.length === 0 ? "it printed nothing" : `it printed: ${printed.join(" | ")}`;
  return `${file} ${args.join(" ")} ${ended}; ${output}`;
}

/** Starts a program of the system folder, never one from the PATH. */
export const runFixed: RunProgram = (file, args, limitMs = runLimitMs) =>
  new Promise((resolve, reject) => {
    execFile(
      `${system32()}\\${file}`,
      args,
      { timeout: limitMs, windowsHide: true },
      (error, stdout, stderr) => {
        if (error === null) return resolve({ stdout });
        const code = typeof error.code === "number" ? error.code : null;
        const failure = { code, stopped: error.killed === true, limitMs, stdout, stderr };
        reject(new Error(fixedRunFailure(file, args, failure), { cause: error }));
      },
    );
  });

/**
 * Windows has no mode bits, so the journal folder gets its own access list
 * (HAL-3896): inheritance off, and only the current user (by SID, so a
 * name with a domain or a space can't be misread) may do anything in it. The
 * programs are the fixed `whoami` and `icacls` of the system folder, never
 * from the PATH. The folder's owner is set to this user too (a folder owned by someone else
 * could be opened up again by them). Throws when either fails, so a session never keeps a journal
 * in a folder another user might reach.
 */
export async function restrictToThisUser(
  folder: string,
  start: RunProgram = runFixed,
): Promise<void> {
  const { stdout } = await start("whoami.exe", ["/user", "/fo", "csv", "/nh"]);
  const sid = /"(S-1-[0-9-]+)"/.exec(stdout)?.[1];
  if (sid === undefined) throw new Error("the current user's SID could not be read");
  // The owner can always change the access list again, so take the ownership first: this fails
  // (and the session keeps no journal) when the folder belongs to someone who won't hand it over.
  await start("icacls.exe", [folder, "/setowner", `*${sid}`]);
  await start("icacls.exe", [folder, "/inheritance:r", "/grant:r", `*${sid}:(OI)(CI)F`]);
  // A new folder also carries the entries of the user's default access list (the system and the
  // administrators); `/grant:r` leaves those, so take them off unless one of them is this user.
  const others = defaultEntries.filter((entry) => entry !== sid);
  if (others.length > 0) {
    await start("icacls.exe", [folder, "/remove:g", ...others.map((entry) => `*${entry}`)]);
  }
}
