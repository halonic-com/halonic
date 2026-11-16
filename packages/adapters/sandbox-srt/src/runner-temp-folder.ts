import { createHash } from "node:crypto";
import { lstat, mkdir, mkdtemp, realpath, rmdir } from "node:fs/promises";
import { join } from "node:path";
import { readFolderAccess, whyNotPrivateTo } from "./folder-access.ts";
import { currentUserSid, type RunProgram, restrictToThisUser, runFixed } from "./journal-acl.ts";

/** How many hex characters of the SID's hash name an account's folder: enough that two accounts never meet, short enough to read. */
const accountNameLength = 16;

/**
 * The name of an account's own folder in the shared folder on Windows: a hash
 * of the account's SID, so the name holds nothing of the account and the same
 * account always finds its folder again.
 */
export function accountFolderName(sid: string): string {
  const hash = createHash("sha256").update(sid).digest("hex");
  return `halonic-runner-${hash.slice(0, accountNameLength)}`;
}

/** Where runner temp folders may be made. */
export interface RunnerTempPlaces {
  /** The folder the temp folders go in when nothing shared is safe: private to the user, in the profile folder. */
  privateParent: string;
  /** Windows: the folder every account shares (`%ProgramData%`), whose path holds no account name. */
  sharedParent?: string | undefined;
}

/** What {@link makeRunnerTempFolder} can be told; a test passes its own. */
export interface RunnerTempOptions {
  /** The system the code runs on. */
  platform?: NodeJS.Platform;
  /** How the system's own programs are started. */
  start?: RunProgram;
  /** Where a note goes when the shared folder is not used. */
  log?: (text: string) => void;
}

/**
 * Makes a fresh temp folder for one runner, private to the current user, and
 * gives its real path (HAL-10674).
 *
 * On Linux and macOS it is `r-…` in `privateParent` with mode 0700. On Windows
 * the runner sees the folder's path, and `privateParent` is inside the user's
 * profile, so the account name would reach the runner. So the folder is made
 * outside the profile, in the account's own folder directly in
 * `sharedParent` ({@link accountFolderName}). `sharedParent` is readable by
 * every account and mode bits do nothing, so nothing in it is trusted unless
 * it is private to this user:
 *
 * - A folder this call makes is restricted to the user (`restrictToThisUser`).
 * - A folder that is already there is never repaired, because whoever made it
 *   may still hold an entry in it, or may have handed this user the right to
 *   take it over. It is used only when it is a plain folder, this user owns
 *   it and its access list is exactly one full-control entry for this user,
 *   inherited from nowhere. This is read again after a restriction.
 *
 * Ordinary accounts can make folders in `%ProgramData%` but can't rename or
 * delete another account's, so once the folder passes, nobody but the
 * administrators can swap it for another. When the folder is refused, or
 * `sharedParent` is missing, the temp folder is made in `privateParent`
 * instead and one line is logged: the runner then sees the account name in its
 * path (the old narrowed gap of A17), but another account can neither read its
 * files nor stop it.
 *
 * @param places where the folder may be made
 * @param options the system, its programs and the log; a test passes its own
 */
export async function makeRunnerTempFolder(
  places: RunnerTempPlaces,
  options: RunnerTempOptions = {},
): Promise<string> {
  const { platform = process.platform, start = runFixed, log = () => undefined } = options;
  if (platform !== "win32") return await makeInPrivateParent(places.privateParent);
  if (places.sharedParent === undefined) {
    log("The runner's temp folder is in the profile folder: %ProgramData% is not set.\n");
    return await makeInPrivateParent(places.privateParent);
  }
  try {
    return await makeInAccountFolder(places.sharedParent, start);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    log(
      `The runner's temp folder is in the profile folder, not in ${places.sharedParent}: ${reason}\n`,
    );
    return await makeInPrivateParent(places.privateParent);
  }
}

async function makeInPrivateParent(parent: string): Promise<string> {
  await mkdir(parent, { recursive: true, mode: 0o700 });
  return await realpath(await mkdtemp(join(parent, "r-")));
}

/** The Windows way: a run folder in the account's own folder in `sharedParent`, which only a private folder of this user may be. */
async function makeInAccountFolder(sharedParent: string, start: RunProgram): Promise<string> {
  const sid = await currentUserSid(start);
  const account = join(sharedParent, accountFolderName(sid));
  const made = await makeFolder(account);
  try {
    if (made) await restrictToThisUser(account, start);
    await assertPrivateToThisUser(account, sid, start);
  } catch (error) {
    // A folder this call made and could not secure is taken away again, so the next start finds none.
    if (made) await rmdir(account).catch(() => undefined);
    throw error;
  }
  // The account folder's own real path is the base: a shared folder given by a short name (`RUNNER~1`) must not look like a swap.
  const realAccount = await realpath(account);
  const expected = await mkdtemp(join(realAccount, "r-"));
  const real = await realpath(expected);
  if (real.toLowerCase() !== expected.toLowerCase()) {
    throw new Error("the run's folder is not where it was made");
  }
  return real;
}

/** Makes a folder, not its parents; says whether this call made it, and `false` when it was already there. */
async function makeFolder(folder: string): Promise<boolean> {
  try {
    await mkdir(folder);
    return true;
  } catch (error) {
    if ((error as { code?: unknown }).code === "EEXIST") return false;
    throw error;
  }
}

/** Throws unless `folder` is a plain folder (no link or junction) that only this user owns and may use. */
async function assertPrivateToThisUser(
  folder: string,
  sid: string,
  start: RunProgram,
): Promise<void> {
  const stats = await lstat(folder);
  if (!stats.isDirectory() || stats.isSymbolicLink()) {
    throw new Error("the account's folder is a link or junction, not a plain folder");
  }
  const reason = whyNotPrivateTo(await readFolderAccess(folder, start), sid);
  if (reason !== undefined) throw new Error(`the account's folder is not private: ${reason}`);
}
