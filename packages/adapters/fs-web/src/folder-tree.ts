import { isPrivateWorkspacePath } from "@halonicjs/ports";
import { isDomError } from "./folder-access.ts";
import type { FileHandle, FolderHandle } from "./handles.ts";

/** One file found under the opened folder, by workspace path. */
export interface FoundFile {
  readonly path: string;
  readonly handle: FileHandle;
}

/**
 * Whether `name` is a file Chromium writes on the way to another: a write
 * goes to `<name>.crswap` next to the file until `close()` puts it in place.
 * Such a file is never workspace content.
 */
export function isScratch(name: string): boolean {
  return name.endsWith(".crswap");
}

/**
 * The folder at workspace path `path` under `root` (`""` for `root`
 * itself), or `null` when there is none or a file is in the way. With
 * `create`, missing folders are made on the way, and a file in the way
 * throws the browser's `TypeMismatchError`.
 */
export async function folderAt(
  root: FolderHandle,
  path: string,
  create = false,
): Promise<FolderHandle | null> {
  let folder = root;
  for (const segment of segmentsOf(path)) {
    try {
      folder = await folder.getDirectoryHandle(segment, { create });
    } catch (error) {
      if (!create && isNotThere(error)) {
        return null;
      }
      throw error;
    }
  }
  return folder;
}

/** The file at workspace path `path` under `root`, or `null` when there is none or a folder is there. */
export async function fileAt(root: FolderHandle, path: string): Promise<FileHandle | null> {
  const { folder, name } = splitPath(path);
  const parent = await folderAt(root, folder);
  if (parent === null) {
    return null;
  }
  try {
    return await parent.getFileHandle(name);
  } catch (error) {
    if (isNotThere(error)) {
      return null;
    }
    throw error;
  }
}

/**
 * Every file under `folder`, whose workspace path is `prefix` (`""` for the
 * opened folder), in no set order. Private entries, scratch files and names
 * a workspace path can't hold are left out, with everything under them.
 */
export async function filesUnder(folder: FolderHandle, prefix: string): Promise<FoundFile[]> {
  try {
    return await walk(folder, prefix);
  } catch (error) {
    // A folder under the opened one removed while it is walked holds nothing now.
    if (prefix !== "" && isDomError(error, "NotFoundError")) {
      return [];
    }
    throw error;
  }
}

async function walk(folder: FolderHandle, prefix: string): Promise<FoundFile[]> {
  const found: FoundFile[] = [];
  for await (const entry of folder.values()) {
    // A backslash can't be in a workspace path; Chromium refuses it anyway.
    if (entry.name.includes("\\") || isScratch(entry.name) || isPrivateWorkspacePath(entry.name)) {
      continue;
    }
    const path = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
    if (entry.kind === "directory") {
      found.push(...(await filesUnder(entry, path)));
    } else {
      found.push({ path, handle: entry });
    }
  }
  return found;
}

/** A checked workspace path's folder (`""` at the top) and file name. */
export function splitPath(path: string): { folder: string; name: string } {
  const slash = path.lastIndexOf("/");
  return slash === -1
    ? { folder: "", name: path }
    : { folder: path.slice(0, slash), name: path.slice(slash + 1) };
}

function segmentsOf(path: string): string[] {
  return path === "" ? [] : path.split("/");
}

/** Whether the browser said there is no such entry, or one of the other kind. */
function isNotThere(error: unknown): boolean {
  return isDomError(error, "NotFoundError") || isDomError(error, "TypeMismatchError");
}
