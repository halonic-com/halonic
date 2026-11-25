import { lstat, mkdir, realpath, unlink } from "node:fs/promises";
import { dirname } from "node:path";

/**
 * The checks on the console socket's folder and on every folder above it (Julian's conditions on
 * HAL-18620). The folder is the only guard: Node can't read a connection's user id, so nobody
 * but this user, or root, may be able to open the folder or swap a folder above it.
 */

/** Why the console socket can't be opened or reached here. */
export class ConsoleSocketError extends Error {
  readonly reason:
    | "windows"
    | "path-too-long"
    | "folder-not-private"
    | "parent-not-private"
    | "not-our-socket";
  /** The socket's path. */
  readonly path: string;
  /** The folder the refusal is about: the socket's own, or the one above it that others may change. */
  readonly folder: string;

  constructor(reason: ConsoleSocketError["reason"], path: string, folder = dirname(path)) {
    super(`The console socket can't be used at ${path} (${reason}: ${folder}).`);
    this.name = "ConsoleSocketError";
    this.reason = reason;
    this.path = path;
    this.folder = folder;
  }
}

/**
 * Makes the socket's folder 0700 (under the caller's umask of 077), or checks the one there is:
 * this user's, a folder and not a link, exactly 0700. It is never changed into shape: a folder
 * someone else could open may already hold their socket or link. Then checks every folder above.
 */
export async function makeOwnFolder(folder: string, path: string, uid: number): Promise<void> {
  await mkdir(folder, { recursive: true, mode: 0o700 });
  await expectOwn(folder, "folder", 0o700, uid, path);
  await checkFoldersAbove(folder, uid, path);
}

/**
 * Checks that every folder above `folder`, by its path as given and by its real path, is this
 * user's or root's and that no one else may write to it, so nobody can swap the console's folder.
 * A link on the way must be this user's or root's, as macOS's `/var` and `/tmp` are. A folder
 * anyone may write to with the sticky bit, such as `/tmp`, is allowed only when the folder right
 * under it is this user's and 0700.
 */
async function checkFoldersAbove(folder: string, uid: number, path: string): Promise<void> {
  for (const start of [folder, await realpath(folder)]) {
    for (let child = start, parent = dirname(start); child !== parent; ) {
      await checkFolderAbove(parent, child, uid, path);
      child = parent;
      parent = dirname(parent);
    }
  }
}

async function checkFolderAbove(
  parent: string,
  child: string,
  uid: number,
  path: string,
): Promise<void> {
  const found = await lstat(parent);
  const refuse = new ConsoleSocketError("parent-not-private", path, parent);
  if (found.uid !== uid && found.uid !== 0) throw refuse;
  if (found.isSymbolicLink() || (found.mode & 0o022) === 0) return;
  const under = await lstat(child);
  const stickyOverOwn =
    (found.mode & 0o1002) === 0o1002 &&
    under.isDirectory() &&
    under.uid === uid &&
    (under.mode & 0o777) === 0o700;
  if (!stickyOverOwn) throw refuse;
}

/** Removes a socket of this user's at `path`; refuses anything else there, never removing it. */
export async function removeLeftoverSocket(path: string, uid: number): Promise<void> {
  const found = await lstat(path).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
  if (found === null) return;
  if (!found.isSocket() || found.uid !== uid) {
    throw new ConsoleSocketError("not-our-socket", path);
  }
  await unlink(path);
}

/** Checks that `place` is, without following a link, this user's `kind` with exactly `mode`. */
export async function expectOwn(
  place: string,
  kind: "folder" | "socket",
  mode: number,
  uid: number,
  path = place,
): Promise<void> {
  const found = await lstat(place);
  const isKind = kind === "folder" ? found.isDirectory() : found.isSocket();
  if (!isKind || found.uid !== uid || (found.mode & 0o777) !== mode) {
    throw new ConsoleSocketError(kind === "folder" ? "folder-not-private" : "not-our-socket", path);
  }
}
