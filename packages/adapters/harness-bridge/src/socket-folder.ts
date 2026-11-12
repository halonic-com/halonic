import { randomBytes } from "node:crypto";
import type { Stats } from "node:fs";
import { lstat, mkdir, readdir, rm, rmdir } from "node:fs/promises";
import { connect } from "node:net";
import { isAbsolute, join } from "node:path";
import { KindedError } from "@halonicjs/std";

/**
 * The longest Unix socket path each system takes, in bytes, and its name for
 * the message. `sun_path` holds 108 bytes on Linux and 104 on macOS, one of
 * them the closing zero. A longer path makes `listen` fail with a bare
 * `EINVAL`, so the bridge checks it first and says what is wrong.
 */
const socketPathLimits: Readonly<Record<string, { system: string; bytes: number }>> = {
  linux: { system: "Linux", bytes: 107 },
  darwin: { system: "macOS", bytes: 103 },
};

/** The limit of a system not listed above: Linux's, which Windows shares. */
const otherSystemLimit = { system: "this system", bytes: 107 };

/** The longest Unix socket path `platform` takes, in bytes. */
export function maxSocketPathBytes(platform: NodeJS.Platform = process.platform): number {
  return socketPathLimitOf(platform).bytes;
}

function socketPathLimitOf(platform: NodeJS.Platform): { system: string; bytes: number } {
  return socketPathLimits[platform] ?? otherSystemLimit;
}

/** The socket's file name in its run folder. */
const socketFileName = "bridge.sock";

/** Only the user the bridge runs as may open the run folder, and so the socket in it. */
const privateMode = 0o700;

/** How to make a run's socket folder; tests choose what is otherwise random or this computer's. */
export interface RunSocketFolderOptions {
  /** The folder's name; short and random unless given. */
  name?: string;
  /** The system whose socket path limit applies; this computer's unless given. */
  platform?: NodeJS.Platform;
}

/**
 * How old an empty run folder must be before a sweep removes it. A live
 * bridge has its folder empty only for the moment between making it and
 * listening in it, so an older empty one was left by a host that stopped.
 */
export const emptyRunFolderMinAgeMs = 60_000;

/**
 * How long a sweep waits for a socket to accept or refuse a connection. A
 * socket that does neither in time counts as live, so it stays.
 */
const socketProbeTimeoutMs = 1_000;

/** One run's own folder and the socket path in it. */
export interface RunSocketFolder {
  folder: string;
  socketPath: string;
}

/**
 * Creates a new folder for one run's socket in `parent`, which only this user
 * can open, and returns it with the socket's path. The folder's name is
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
  options: RunSocketFolderOptions = {},
): Promise<RunSocketFolder> {
  const { name = randomBytes(6).toString("base64url"), platform = process.platform } = options;
  if (!isAbsolute(parent)) {
    throw new KindedError("invalid_input", `The bridge's socket folder ${parent} isn't absolute.`);
  }
  const folder = join(parent, name);
  const socketPath = join(folder, socketFileName);
  const length = Buffer.byteLength(socketPath);
  const limit = socketPathLimitOf(platform);
  if (length > limit.bytes) {
    throw new KindedError(
      "invalid_input",
      `The bridge's socket path would be ${length} bytes, and ${limit.system} takes at most ${limit.bytes}. Move Halonic's data to a shorter path.`,
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

/**
 * Removes the run folders in `parent` that a bridge left behind when its host
 * stopped without closing it: it crashed, or was killed. Call it once, when
 * the host starts, from the one host that holds the profile's lock.
 *
 * Another host may serve live bridges in the same `parent`, so it removes
 * only what is certainly left over: a real folder of this user's with mode
 * 0700 that holds nothing but a socket named like the bridge's, which refuses
 * a connection because nothing listens on it any more, or that has been empty
 * for {@link emptyRunFolderMinAgeMs}. Anything else stays where it is.
 *
 * @param now - the time, in milliseconds since the epoch; tests give one
 * @returns the names of the run folders it removed
 * @throws KindedError `unavailable` when `parent` exists but isn't a real folder of this user's that nobody else can write to
 */
export async function sweepRunSocketFolders(
  parent: string,
  now: number = Date.now(),
): Promise<string[]> {
  let names: string[];
  try {
    names = await readdir(parent);
  } catch (error) {
    if (isMissing(error)) return [];
    throw new KindedError("unavailable", "Halonic couldn't read the bridge's socket folder.", {
      cause: error,
    });
  }
  // As in `makeRunSocketFolder`: in a folder others could change, a removal could hit theirs.
  await checkOwnFolder(parent, isWritableByUsAlone);
  const removed: string[] = [];
  for (const name of names) {
    // One that went away meanwhile, as a live bridge closed, or that can't be read
    // or removed, is left alone.
    const gone = await removeIfLeftOver(join(parent, name), now).catch(() => false);
    if (gone) removed.push(name);
  }
  return removed;
}

/** Removes one run folder in a sweep when it is certainly left over; see {@link sweepRunSocketFolders}. */
async function removeIfLeftOver(folder: string, now: number): Promise<boolean> {
  const stats = await lstat(folder);
  if (!isOwnFolder(stats, isPrivate)) return false;
  const run: RunSocketFolder = { folder, socketPath: join(folder, socketFileName) };
  const entries = await readdir(folder);
  if (entries.length === 0) {
    if (now - stats.mtimeMs < emptyRunFolderMinAgeMs) return false;
    // Only the folder: a bridge that started listening in it since it was read
    // keeps its socket, as `rmdir` fails on a folder that isn't empty.
    await rmdir(folder);
    return true;
  }
  const leftOver =
    entries.length === 1 && entries[0] === socketFileName && (await isDeadSocket(run.socketPath));
  if (!leftOver) return false;
  // Fails, and so leaves the folder, when something was added to it since it was read.
  await removeRunSocketFolder(run);
  return true;
}

/**
 * Whether `socketPath` is a socket that nothing listens on: a connection to
 * it is refused. One that doesn't answer within {@link socketProbeTimeoutMs}
 * counts as live.
 */
async function isDeadSocket(socketPath: string): Promise<boolean> {
  if (!(await lstat(socketPath)).isSocket()) return false;
  return new Promise((resolve) => {
    const probe = connect(socketPath);
    const finish = (dead: boolean) => {
      clearTimeout(timer);
      probe.destroy();
      resolve(dead);
    };
    const timer = setTimeout(() => finish(false), socketProbeTimeoutMs);
    probe.once("connect", () => finish(false));
    probe.once("error", (error: NodeJS.ErrnoException) => {
      // macOS also refuses a connection when a live socket's listen backlog is
      // full, so a host serving a burst of connections could lose a live run
      // here. The sweep runs once, when the host starts, and a bridge serves
      // one run's agent, so a full backlog then is not expected.
      finish(error.code === "ECONNREFUSED");
    });
  });
}

function isMissing(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
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
  if (isOwnFolder(await lstat(folder), modeIsSafe)) return;
  throw new KindedError(
    "unavailable",
    `The bridge's socket folder ${folder} isn't private to this user, so Halonic didn't use it.`,
  );
}

/** Whether `stats` are those of a real folder, not a link, of this user's whose mode passes `modeIsSafe`. */
function isOwnFolder(stats: Stats, modeIsSafe: (mode: number) => boolean): boolean {
  const ownedByUs = process.getuid === undefined || stats.uid === process.getuid();
  return stats.isDirectory() && ownedByUs && modeIsSafe(stats.mode);
}
