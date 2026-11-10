import { randomUUID } from "node:crypto";
import type { Dirent } from "node:fs";
import { chmod, mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import {
  checkPublicWorkspacePath,
  type DefinitionStore,
  type Digest,
  isPrivateWorkspacePath,
  type WriteOptions,
  type WriteResult,
} from "@halonicjs/ports";
import { bytesToHex, KeyedQueue, matchesExpected } from "@halonicjs/std";
import { entryAt, isMissing } from "./links.ts";

/** The Web Crypto API that Node has, as the {@link Digest} port. */
const webCryptoDigest: Digest = {
  async sha256(data) {
    return new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(data)));
  },
};

/**
 * Names of the temporary files a write renames into place. `list()` leaves
 * them out, so a write in progress never shows up as a workspace file.
 */
const temporaryWriteName = /^\.halonic-write-[0-9a-f-]+\.tmp$/u;

/**
 * Workspace files as plain files under a root folder: what the CLI and
 * `halonic serve` read on a machine. Paths are checked like every other
 * store's (see the port). It never follows a symbolic link or a Windows
 * junction: one in any segment of a path is refused, and `list()` leaves
 * links out with everything under them.
 *
 * A write goes to a temporary file in the same folder that is then renamed
 * over the file, so another program reads the old text or the new, never
 * half of it. Writes to one path run one after another, so the check for
 * `expected` and its write are never split by another write from this
 * store. A program outside Halonic can still change the file between the
 * check and the rename; that gap is a few milliseconds and the watcher
 * reports such a change.
 */
export class FolderDefinitionStore implements DefinitionStore {
  readonly location: string;
  readonly #root: string;
  readonly #writes = new KeyedQueue();

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

  async write(path: string, content: string, options: WriteOptions = {}): Promise<WriteResult> {
    checkPublicWorkspacePath(path);
    return await this.#writes.run(path, async () => {
      const { expected } = options;
      if (expected !== undefined) {
        const current = await this.read(path);
        if (!(await matchesExpected(current, expected, webCryptoDigest))) {
          return { status: "changed-on-disk", current };
        }
      }
      await this.#replace(path, content);
      return { status: "written" };
    });
  }

  /** Writes `content` to a temporary file next to `path` and renames it over the file. */
  async #replace(path: string, content: string): Promise<void> {
    // Checks the folders on the way and the file itself, so the write can't land behind a link.
    const existing = await entryAt(this.#root, path);
    const file = join(this.#root, path);
    const folder = dirname(file);
    await mkdir(folder, { recursive: true });
    const temporary = join(folder, `.halonic-write-${randomUUID()}.tmp`);
    try {
      await writeFile(temporary, content, { encoding: "utf8", flag: "wx" });
      if (existing !== null) {
        // A replaced file keeps its permissions, such as a script's execute bit.
        await chmod(temporary, existing.mode & 0o7777);
      }
      await rename(temporary, file);
    } catch (error) {
      await rm(temporary, { force: true });
      throw error;
    }
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
        temporaryWriteName.test(entry.name) ||
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
