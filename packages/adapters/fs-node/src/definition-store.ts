import type { Dirent } from "node:fs";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import {
  checkPublicWorkspacePath,
  type DefinitionStore,
  isPrivateWorkspacePath,
} from "@halonicjs/ports";
import { bytesToHex } from "@halonicjs/std";
import { entryAt, isMissing } from "./links.ts";

/**
 * Workspace files as plain files under a root folder: what the CLI and
 * `halonic serve` read on a machine. Paths are checked like every other
 * store's (see the port). It never follows a symbolic link or a Windows
 * junction: one in any segment of a path is refused, and `list()` leaves
 * links out with everything under them.
 */
export class FolderDefinitionStore implements DefinitionStore {
  readonly location: string;
  readonly #root: string;

  /**
   * @param root - the workspace folder; a relative one is resolved against the working directory
   * @param location - shown to people as where the files live; the root by default
   */
  constructor(root: string, location?: string) {
    this.#root = resolve(root);
    this.location = location ?? root;
  }

  async list(dir?: string): Promise<string[]> {
    const paths: string[] = [];
    if (dir === undefined) {
      await this.#collect(this.#root, "", paths);
    } else {
      checkPublicWorkspacePath(dir);
      if ((await entryAt(this.#root, dir))?.isDirectory()) {
        await this.#collect(join(this.#root, dir), dir, paths);
      }
    }
    return paths.sort();
  }

  async read(path: string): Promise<string | null> {
    checkPublicWorkspacePath(path);
    if (!(await entryAt(this.#root, path))?.isFile()) {
      return null;
    }
    return await readFile(join(this.#root, path), "utf8");
  }

  async write(path: string, content: string): Promise<void> {
    checkPublicWorkspacePath(path);
    // Checks the folders on the way and the file itself, so the write can't land behind a link.
    await entryAt(this.#root, path);
    const file = join(this.#root, path);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, content, "utf8");
  }

  async remove(path: string): Promise<void> {
    checkPublicWorkspacePath(path);
    if (!(await entryAt(this.#root, path))?.isFile()) {
      return;
    }
    // `force`: a file another program removed in the meantime is not an error.
    await rm(join(this.#root, path), { force: true });
  }

  /**
   * `sha256:` and the first 16 hex characters of a hash over every file it
   * serves and its text, worked out as the memory adapter does, so the same
   * files give the same version in both.
   */
  async version(): Promise<string> {
    const parts: string[] = [];
    for (const path of await this.list()) {
      const content = await this.read(path);
      if (content !== null) {
        parts.push(`${path}\n${content}`);
      }
    }
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(parts.join("\n\0")),
    );
    return `sha256:${bytesToHex(new Uint8Array(digest)).slice(0, 16)}`;
  }

  /** Adds the files under `folder`, whose workspace path is `prefix`, to `into`, leaving out links and private entries. */
  async #collect(folder: string, prefix: string, into: string[]): Promise<void> {
    let entries: Dirent[];
    try {
      entries = await readdir(folder, { withFileTypes: true });
    } catch (error) {
      if (isMissing(error)) {
        return;
      }
      throw error;
    }
    for (const entry of entries) {
      // A backslash is allowed in a file name on Linux, but not in a workspace path.
      if (
        entry.isSymbolicLink() ||
        entry.name.includes("\\") ||
        isPrivateWorkspacePath(entry.name)
      ) {
        continue;
      }
      const path = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
      if (entry.isDirectory()) {
        await this.#collect(join(folder, entry.name), path, into);
      } else if (entry.isFile()) {
        into.push(path);
      }
    }
  }
}
