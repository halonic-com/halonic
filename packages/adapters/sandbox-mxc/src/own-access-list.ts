// The box folders' base gets its own access list (grant rule 6, revised in
// HAL-3503 and HAL-13373). On a real PC, MXC failed in every folder that
// inherited its access list from the user's AppData, while %LOCALAPPDATA%\Temp,
// which has its own, passed. So the base gets the same entries Temp has, with
// inheritance off, and the box folders inside it inherit from there.

import { execFile } from "node:child_process";

/** The SIDs of the system and of the Administrators group, which Temp's access list names next to its user. */
const systemAndAdministrators = ["S-1-5-18", "S-1-5-32-544"];

/** How long a program of the system folder may run before it is stopped. */
const runLimitMs = 15_000;

/** What {@link giveOwnAccessList} starts; a test hands in a fake. */
export type RunProgram = (file: string, args: string[]) => Promise<{ stdout: string }>;

/** The system folder, from the environment Windows always sets. */
function system32(): string {
  const root = process.env["SystemRoot"];
  if (root === undefined) throw new Error("SystemRoot is not set");
  return `${root}\\System32`;
}

/** Starts a program of the system folder, never one from the PATH, with no shell. */
export const runFixed: RunProgram = (file, args) =>
  new Promise((resolve, reject) => {
    execFile(
      `${system32()}\\${file}`,
      args,
      { timeout: runLimitMs, windowsHide: true },
      (error, stdout, stderr) => {
        if (error === null) return resolve({ stdout });
        const printed = [stderr.trim(), stdout.trim()].filter((text) => text !== "").join(" | ");
        const output = printed === "" ? "it printed nothing" : `it printed: ${printed}`;
        reject(new Error(`${file} ${args.join(" ")} failed; ${output}`, { cause: error }));
      },
    );
  });

/**
 * The SID of the user this process runs as, from the fixed `whoami` of the
 * system folder. A SID, not a name, so a name with a domain or a space can't
 * be misread.
 *
 * @throws when the SID can't be read
 */
async function currentUserSid(start: RunProgram): Promise<string> {
  const { stdout } = await start("whoami.exe", ["/user", "/fo", "csv", "/nh"]);
  const sid = /"(S-1-[0-9-]+)"/.exec(stdout)?.[1];
  if (sid === undefined) throw new Error("the current user's SID could not be read");
  return sid;
}

/**
 * Gives a folder its own access list, the way Windows sets up Temp:
 * inheritance off, and Full Control for only the current user, SYSTEM and
 * Administrators, passed on to everything inside. Running it again on a
 * folder that already has it changes nothing, so it also fixes a folder an
 * older Halonic made.
 *
 * @example
 * await giveOwnAccessList("%LOCALAPPDATA%\\halonic\\mxc-boxes");
 *
 * @throws when `whoami` or `icacls` fails
 */
export async function giveOwnAccessList(
  folder: string,
  start: RunProgram = runFixed,
): Promise<void> {
  const sid = await currentUserSid(start);
  const owners = [sid, ...systemAndAdministrators.filter((entry) => entry !== sid)];
  // `/inheritance:r` drops what the folder inherited from AppData; `/grant:r`
  // replaces any entry these three already have instead of adding to it.
  await start("icacls.exe", [
    folder,
    "/inheritance:r",
    "/grant:r",
    ...owners.map((entry) => `*${entry}:(OI)(CI)F`),
  ]);
}
