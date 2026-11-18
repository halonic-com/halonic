// A plugin's files, copied for one local tool session (HAL-12343). The trust
// check hashed the plugin's folder before the session opened, but a script
// in that folder is read again by its program after the check, so a change
// in between would run code the person never trusted. The host copies the
// checked files into a new folder for the session instead, checking each
// file's bytes against the hash the trust check took as it copies them, and
// the program starts from that copy. It then runs exactly the bytes the
// person trusted, and the plugin's own folder, inside Halonic's data, stays
// out of the session's reach.

import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { mkdir, open, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

/** One file the trust check hashed: its path from the plugin's folder with `/`, and the SHA-256 of its bytes in lowercase hex. */
export interface CheckedPluginFile {
  readonly path: string;
  readonly sha256: string;
}

/** What {@link copyCheckedPlugin} reads and writes. */
export interface PluginCopyDisk {
  /** A plain file's bytes; throws when it is a link, a folder or something else, or can't be read. */
  readPlainFile(path: string): Promise<Uint8Array>;
  /** Creates a folder whose parent exists; throws when the folder already exists. */
  makeFolder(path: string): Promise<void>;
  /** Writes a new file, making the folders on its way; throws when the file already exists. */
  writeNewFile(path: string, bytes: Uint8Array): Promise<void>;
}

/** A file in the plugin's folder isn't what the trust check hashed, so nothing of the plugin starts. */
export class PluginFileChangedError extends Error {
  override readonly name = "PluginFileChangedError";
  /** The file's path from the plugin's folder. It names the file, never its contents. */
  readonly path: string;

  constructor(path: string, reason: "changed" | "unreadable") {
    super(
      reason === "changed"
        ? `The plugin's file ${path} changed after Halonic checked it, so the local tool doesn't start.`
        : `Halonic couldn't read the plugin's file ${path} again, so the local tool doesn't start.`,
    );
    this.path = path;
  }
}

/** The disk the plugin is really on. A link is refused where the system can tell, so only a plain file is read. */
export const pluginCopyOnThisMachine: PluginCopyDisk = {
  readPlainFile: async (path) => {
    // `O_NOFOLLOW` is 0 on Windows, where the check after opening refuses what isn't a file.
    const file = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    try {
      if (!(await file.stat()).isFile()) throw new Error("not a plain file");
      return await file.readFile();
    } finally {
      await file.close();
    }
  },
  makeFolder: async (path) => {
    await mkdir(path);
  },
  writeNewFile: async (path, bytes) => {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, bytes, { flag: "wx" });
  },
};

/**
 * Copies the plugin's checked files from `from` into the new folder `into`,
 * each only when its bytes still hash to what the trust check listed. Only
 * the bytes that were hashed are written, so the copy holds the trusted
 * files and nothing else, whatever happens to `from` meanwhile.
 *
 * `into` must not exist yet. When a file differs or can't be read, the copy
 * stops; the caller removes `into` with the session's other folders.
 *
 * @param from - the plugin's folder, as the trust check read it
 * @param files - the files the trust check hashed, as `TrustedPluginFolder.files` lists them
 * @param into - the session's new folder for the copy, in a folder the host made for the session
 * @throws `PluginFileChangedError` naming the first file that differs or can't be read
 * @throws a `RangeError` when a listed path could leave the folder
 *
 * @example
 * await copyCheckedPlugin(trusted.location, trusted.files, join(sessionFolder, "plugin"));
 */
export async function copyCheckedPlugin(
  from: string,
  files: readonly CheckedPluginFile[],
  into: string,
  disk: PluginCopyDisk = pluginCopyOnThisMachine,
): Promise<void> {
  // Every path first, so a bad list copies nothing.
  const names = files.map((file) => pathNames(file.path));
  await disk.makeFolder(into);
  for (const [index, file] of files.entries()) {
    const at = names[index] ?? [];
    let bytes: Uint8Array;
    try {
      bytes = await disk.readPlainFile(join(from, ...at));
    } catch {
      throw new PluginFileChangedError(file.path, "unreadable");
    }
    if (sha256Hex(bytes) !== file.sha256) throw new PluginFileChangedError(file.path, "changed");
    await disk.writeNewFile(join(into, ...at), bytes);
  }
}

/**
 * A listed path's names, refused unless each one stays in the folder: no
 * empty name, `.` or `..`, and no `\` or `:`, which Windows reads as a
 * separator or a drive.
 */
function pathNames(path: string): string[] {
  const names = path.split("/");
  const bad = names.some(
    (name) => name === "" || name === "." || name === ".." || /[\\:]/u.test(name),
  );
  if (bad) throw new RangeError(`${JSON.stringify(path)} isn't a path inside a plugin's folder`);
  return names;
}

function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}
