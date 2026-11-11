import { execFile } from "node:child_process";

/** The SIDs of the system and of the Administrators group, which a new folder's default access list names. */
const defaultEntries = ["S-1-5-18", "S-1-5-32-544"];

/** What {@link restrictToThisUser} starts; a test hands in a fake. */
export type RunProgram = (file: string, args: string[]) => Promise<{ stdout: string }>;

/** The system folder, from the environment Windows always sets. */
function system32(): string {
  const root = process.env["SystemRoot"];
  if (root === undefined) throw new Error("SystemRoot is not set");
  return `${root}\\System32`;
}

const runFixed: RunProgram = (file, args) =>
  new Promise((resolve, reject) => {
    execFile(
      `${system32()}\\${file}`,
      args,
      { timeout: 15_000, windowsHide: true },
      (error, stdout) => (error === null ? resolve({ stdout }) : reject(error)),
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
