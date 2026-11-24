// The server refuses to start when its own code can be changed from where
// it runs (HAL-16748). It runs inside the agent's fence; if the agent could
// rewrite it, as when Halonic runs from a copy of the repo the agent is
// editing, the agent could turn `read_ranges` into anything and get round
// the approval card. The profile builder checks the same from outside.

import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { access, open, readdir, rm, stat } from "node:fs/promises";
import { join } from "node:path";

/** Whether a file or folder can be changed from this process. */
export type WriteProbe = (path: string, kind: "file" | "folder") => Promise<boolean>;

/** The errors that say "not writable here": no rights, or a read-only file system. */
const notWritableCodes = new Set(["EACCES", "EPERM", "EROFS"]);

/** The server's code can be changed from where it runs. */
export class ChangeableCodeError extends Error {
  constructor(path: string) {
    super(
      `The coding tools server doesn't start: its code at ${path} can be changed from inside the sandbox, so the agent could rewrite it.`,
    );
    this.name = "ChangeableCodeError";
  }
}

/**
 * The probe on this computer. A file is opened for writing and closed again,
 * without writing, so nothing changes. A folder gets a new, empty file,
 * removed at once; that happens only in the case that is refused.
 */
export const writeProbeOnThisComputer: WriteProbe = async (path, kind) => {
  const target = kind === "file" ? path : join(path, `.halonic-write-check-${randomUUID()}`);
  try {
    const handle = await open(target, kind === "file" ? "r+" : "wx");
    await handle.close();
  } catch (error) {
    if (isNotWritable(error)) return false;
    // Linux won't open a running program for writing, the runtime itself
    // included, whatever its rights: ask the system instead.
    if (hasCode(error, "ETXTBSY")) return await accessAllowsWriting(path);
    throw error;
  }
  if (kind === "folder") await rm(target, { force: true });
  return true;
};

/**
 * Throws when any of `paths`, or anything in a folder among them, all the
 * way down, can be changed from here (requirement `coding-tools.stdio`).
 * Links are tested where they lead, and not walked into.
 *
 * @param paths - the runtime and the folders and files of the server's code
 * @throws {ChangeableCodeError} naming the first one that can be changed
 */
export async function refuseChangeableCode(
  paths: readonly string[],
  probe: WriteProbe = writeProbeOnThisComputer,
): Promise<void> {
  for (const path of paths) {
    const folder = await folderEntries(path);
    if (await probe(path, folder === null ? "file" : "folder")) throw new ChangeableCodeError(path);
    if (folder === null) continue;
    await refuseChangeableCode(
      folder.filter((entry) => !entry.isSymbolicLink()).map((entry) => join(path, entry.name)),
      probe,
    );
    const links = folder.filter((entry) => entry.isSymbolicLink());
    await refuseChangeableLinks(
      links.map((link) => join(path, link.name)),
      probe,
    );
  }
}

/**
 * Throws when a link's target can be changed. Each is probed where it
 * leads, as a folder when it leads to one, such as a workspace package in
 * `node_modules`, and not walked into.
 */
async function refuseChangeableLinks(links: readonly string[], probe: WriteProbe): Promise<void> {
  for (const link of links) {
    const kind = (await stat(link)).isDirectory() ? "folder" : "file";
    if (await probe(link, kind)) throw new ChangeableCodeError(link);
  }
}

/** A folder's entries, or `null` when `path` isn't a folder. */
async function folderEntries(path: string) {
  try {
    return await readdir(path, { withFileTypes: true });
  } catch (error) {
    if (hasCode(error, "ENOTDIR")) return null;
    throw error;
  }
}

/** Whether the system says this process may write the file. */
async function accessAllowsWriting(path: string): Promise<boolean> {
  try {
    await access(path, constants.W_OK);
    return true;
  } catch (error) {
    if (isNotWritable(error)) return false;
    throw error;
  }
}

function isNotWritable(error: unknown): boolean {
  return [...notWritableCodes].some((code) => hasCode(error, code));
}

function hasCode(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}
