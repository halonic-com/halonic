import { randomBytes } from "node:crypto";
import { lstat, mkdir, rm, rmdir } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { KindedError } from "@halonicjs/std";

/**
 * The longest Unix socket path Linux takes, in bytes: `sun_path` holds 108,
 * one of them the closing zero. A longer path makes `listen` fail with a bare
 * `EINVAL`, so the bridge checks it first and says what is wrong.
 */
export const maxSocketPathBytes = 107;

/** The socket's file name in its run folder. */
const socketFileName = "bridge.sock";

/** Only the user the bridge runs as may open the run folder, and so the socket in it. */
const privateMode = 0o700;

/** One run's own folder and the socket path in it. */
export interface RunSocketFolder {
  folder: string;
  socketPath: string;
}

/**
 * Creates a new folder for one run's socket in `parent`, which only this user
 * can open, and returns it with the socket's path. The folder's `name` is
 * short and random unless a test gives one, so the path stays short and no
 * two runs share a folder.
 *
 * It never reuses a path: the folder must not exist yet, and once made it
 * must be a real folder, not a link, owned by this user, with mode 0700.
 * `parent` must be a real folder of this user's that nobody else can write
 * to, or someone else could swap the run folder after the check and be
 * handed the run's token.
 *
 * @throws KindedError `invalid_input` when `parent` isn't absolute, or the socket's path would be too long
 * @throws KindedError `unavailable` when the folder can't be created, or it or `parent` isn't private
 */
export async function makeRunSocketFolder(
  parent: string,
  name: string = randomBytes(6).toString("base64url"),
): Promise<RunSocketFolder> {
  if (!isAbsolute(parent)) {
    throw new KindedError("invalid_input", `The bridge's socket folder ${parent} isn't absolute.`);
  }
  const folder = join(parent, name);
  const socketPath = join(folder, socketFileName);
  const length = Buffer.byteLength(socketPath);
  if (length > maxSocketPathBytes) {
    throw new KindedError(
      "invalid_input",
      `The bridge's socket path would be ${length} bytes, and Linux takes at most ${maxSocketPathBytes}. Move Halonic's data to a shorter path.`,
    );
  }
  try {
    await mkdir(parent, { recursive: true, mode: privateMode });
  } catch (cause) {
    throw new KindedError("unavailable", "Halonic couldn't create the bridge's socket folder.", {
      cause,
    });
  }
  // An existing parent isn't changed by `mkdir`, so it is checked here.
  await checkOwnFolder(parent, isWritableByUsAlone);
  try {
    // Not recursive: it fails when the path already exists, so nothing is reused.
    await mkdir(folder, { mode: privateMode });
  } catch (cause) {
    throw new KindedError("unavailable", "Halonic couldn't create the bridge's socket folder.", {
      cause,
    });
  }
  await checkOwnFolder(folder, isPrivate);
  return { folder, socketPath };
}

/**
 * Removes the run's socket and its folder. Both were created by the bridge,
 * so nothing else is removed: `rmdir` fails on a folder that holds anything
 * more.
 */
export async function removeRunSocketFolder({ folder, socketPath }: RunSocketFolder) {
  await rm(socketPath, { force: true });
  await rmdir(folder);
}

/** Whether only the owner may open the folder: mode 0700. */
function isPrivate(mode: number): boolean {
  return (mode & 0o777) === privateMode;
}

/** Whether nobody but the owner may add, remove or rename entries in the folder. */
function isWritableByUsAlone(mode: number): boolean {
  return (mode & 0o022) === 0;
}

/**
 * Leaves a folder that fails the check where it is: something other than
 * the bridge may have put it there, so the bridge doesn't remove it.
 *
 * @throws KindedError `unavailable` when `folder` isn't a real folder of this user's whose mode passes `modeIsSafe`
 */
async function checkOwnFolder(
  folder: string,
  modeIsSafe: (mode: number) => boolean,
): Promise<void> {
  const stats = await lstat(folder);
  const ownedByUs = process.getuid === undefined || stats.uid === process.getuid();
  if (stats.isDirectory() && ownedByUs && modeIsSafe(stats.mode)) return;
  throw new KindedError(
    "unavailable",
    `The bridge's socket folder ${folder} isn't private to this user, so Halonic didn't use it.`,
  );
}
