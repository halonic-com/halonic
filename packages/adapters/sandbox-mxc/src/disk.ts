import { copyFile, mkdir, readFile, realpath, rm, stat, writeFile } from "node:fs/promises";
import type { GrantDisk } from "./grant-path.ts";

/**
 * What a session asks of the disk: the kind of a path (for the grants), and
 * the files and folders of the fence proof. A test hands in a fake one;
 * {@link fileDisk} is the real one.
 */
export interface MxcDisk extends GrantDisk {
  /** Creates `path` and its parents; nothing happens when it is there. */
  makeFolder(path: string): Promise<void>;
  /** Writes a text file, replacing one that is there. The folder must exist. */
  writeText(path: string, text: string): Promise<void>;
  /** A text file's content, or `null` when it isn't there. */
  readText(path: string): Promise<string | null>;
  /** Where a path really is once every link and junction on it is followed, or `null` when it isn't there. */
  realPath(path: string): Promise<string | null>;
  /** Copies a file to `to`, replacing one that is there. The folder of `to` must exist. */
  copyFile(from: string, to: string): Promise<void>;
  /** Removes a file or folder; nothing happens when it isn't there. */
  remove(path: string): Promise<void>;
}

/** The real disk. */
export const fileDisk: MxcDisk = {
  kind: async (path) => {
    try {
      return (await stat(path)).isDirectory() ? "folder" : "file";
    } catch (error) {
      if (isMissing(error)) return "missing";
      throw error;
    }
  },
  makeFolder: async (path) => {
    await mkdir(path, { recursive: true });
  },
  writeText: (path, text) => writeFile(path, text),
  copyFile: (from, to) => copyFile(from, to),
  realPath: async (path) => {
    try {
      // Windows may answer with a `\\?\` prefix, which the policy's paths never carry.
      return (await realpath(path)).replace(/^\\\\\?\\/, "");
    } catch (error) {
      if (isMissing(error)) return null;
      throw error;
    }
  },
  readText: async (path) => {
    try {
      return await readFile(path, "utf8");
    } catch (error) {
      if (isMissing(error)) return null;
      throw error;
    }
  },
  remove: (path) => rm(path, { recursive: true, force: true }),
};

function isMissing(error: unknown): boolean {
  const code = error instanceof Error && "code" in error ? error.code : undefined;
  return code === "ENOENT" || code === "ENOTDIR";
}
