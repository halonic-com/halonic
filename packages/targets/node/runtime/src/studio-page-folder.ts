import { readFile, realpath } from "node:fs/promises";
import { resolve, sep } from "node:path";
import type { StudioPage } from "@halonicjs/host-server";

/** The errors that mean "there is no such file here", as opposed to a disk that fails. */
const missing = new Set(["ENOENT", "ENOTDIR", "EISDIR"]);

/**
 * The built Studio page, read from a folder on disk, for `GET /`.
 *
 * It reads only inside the folder. The server already refuses paths that climb
 * out of it, and this checks again against the real path, so a link inside the
 * folder that points elsewhere reads as no file.
 *
 * @param folder - the build's folder, such as `apps/studio/dist/studio`; it may be missing, and then every file is missing
 */
export function openStudioPageFolder(folder: string): StudioPage {
  return {
    async read(path) {
      try {
        const root = await realpath(resolve(folder));
        const file = await realpath(resolve(root, path));
        if (!file.startsWith(root + sep)) return null;
        return new Uint8Array(await readFile(file));
      } catch (error) {
        if (error instanceof Error && "code" in error && missing.has(String(error.code))) {
          return null;
        }
        throw error;
      }
    },
  };
}
