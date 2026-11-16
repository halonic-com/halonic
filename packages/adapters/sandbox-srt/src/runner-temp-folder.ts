import { createHash } from "node:crypto";
import { lstat, mkdir, mkdtemp, realpath } from "node:fs/promises";
import { join, sep } from "node:path";
import { currentUserSid, type RunProgram, restrictToThisUser, runFixed } from "./journal-acl.ts";

/** How many hex characters of the SID's hash name an account's folder: enough that two accounts never meet, short enough to read. */
const accountNameLength = 16;

/**
 * The name of an account's own folder in the shared runner temp folder on
 * Windows: a hash of the account's SID, so the name holds nothing of the
 * account and the same account always finds its folder again.
 */
export function accountFolderName(sid: string): string {
  return createHash("sha256").update(sid).digest("hex").slice(0, accountNameLength);
}

/**
 * Makes a fresh temp folder for one runner, private to the current user, and
 * gives its real path (HAL-10674).
 *
 * On Linux and macOS it is `r-…` in `parent` with mode 0700. On Windows
 * `parent` is shared by every account of the computer (`%ProgramData%`'s
 * `halonic\runner-temp`), whose default access list lets every account read
 * what is made in it, and mode bits do nothing. So each account gets a folder
 * of its own in it ({@link accountFolderName}) that only it may use
 * (`restrictToThisUser`: inheritance off, this user the owner and the only
 * entry), and the run's folder is made inside that one and inherits its
 * access list. A folder that is not a plain folder (a junction or link
 * someone made in advance) or that another account owns is refused:
 * taking the ownership fails unless this user may have it.
 *
 * @param parent the folder the runner temp folders go in, absolute
 * @param platform the system the code runs on; a test passes its own
 * @param start how the system's own programs are started; a test passes a fake
 * @throws Error when the folder is not a plain folder, another account owns
 *   it, or its access list can't be set
 */
export async function makeRunnerTempFolder(
  parent: string,
  platform: NodeJS.Platform = process.platform,
  start: RunProgram = runFixed,
): Promise<string> {
  if (platform !== "win32") {
    await mkdir(parent, { recursive: true, mode: 0o700 });
    return await realpath(await mkdtemp(join(parent, "r-")));
  }
  await mkdir(parent, { recursive: true });
  await assertPlainFolder(parent);
  const account = join(parent, accountFolderName(await currentUserSid(start)));
  await mkdir(account).catch((error: unknown) => {
    if ((error as { code?: unknown }).code !== "EEXIST") throw error;
  });
  await assertPlainFolder(account);
  await restrictToThisUser(account, start);
  // The access list was set on what the path named then: look again, so a folder swapped in between is not used.
  await assertPlainFolder(account);
  const folder = await realpath(await mkdtemp(join(account, "r-")));
  if (!folder.startsWith(`${await realpath(account)}${sep}`)) {
    throw new Error("the runner's temp folder was made outside the account's own folder");
  }
  return folder;
}

/** Throws unless `folder` is a folder itself, not a junction or symbolic link to somewhere else. */
async function assertPlainFolder(folder: string): Promise<void> {
  const stats = await lstat(folder);
  if (!stats.isDirectory() || stats.isSymbolicLink()) {
    throw new Error(`${folder} is not a plain folder (a link or junction), so it is not used`);
  }
}
