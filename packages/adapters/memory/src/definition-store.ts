import {
  checkPublicWorkspacePath,
  checkWorkspacePath,
  type DefinitionStore,
  type DefinitionWatch,
  type DefinitionWatchListener,
  isPrivateWorkspacePath,
  type WorkspaceFileChange,
  type WriteOptions,
  type WriteResult,
} from "@halonicjs/ports";
import { KeyedQueue, matchesExpected } from "@halonicjs/std";
import { sha256Hex, webCryptoDigest } from "./sha256.ts";

/**
 * Workspace files in a map: for tests, the browser demo and the parity
 * harness. Paths are checked like every other store's (see the port). It may
 * start with private entries, such as `.env`, as a folder can hold them, but
 * it never serves or lists them.
 *
 * Nothing outside Halonic can change a map, so `watch()` reports only what a
 * test makes up with {@link MemoryDefinitionStore.changeOutside}.
 */
export class MemoryDefinitionStore implements DefinitionStore {
  readonly location: string;
  readonly #files = new Map<string, string>();
  /**
   * Writes and removes of one path run one after another, so the check for
   * `expected` and the write are never split, not even by a remove.
   */
  readonly #writes = new KeyedQueue();
  readonly #listeners = new Set<DefinitionWatchListener>();

  /**
   * @param files - the files to start with, by relative path
   * @param location - shown to people as where the files live
   * @throws RangeError when a path in `files` is unsafe
   */
  constructor(files: Readonly<Record<string, string>> = {}, location = "memory:workspace") {
    this.location = location;
    for (const [path, content] of Object.entries(files)) {
      checkWorkspacePath(path);
      this.#files.set(path, content);
    }
  }

  async list(dir?: string): Promise<string[]> {
    const paths = [...this.#files.keys()].filter((path) => !isPrivateWorkspacePath(path));
    if (dir === undefined) {
      return paths.sort();
    }
    checkPublicWorkspacePath(dir);
    return paths.filter((path) => path.startsWith(`${dir}/`)).sort();
  }

  async read(path: string): Promise<string | null> {
    checkPublicWorkspacePath(path);
    return this.#files.get(path) ?? null;
  }

  async write(path: string, content: string, options: WriteOptions = {}): Promise<WriteResult> {
    checkPublicWorkspacePath(path);
    return await this.#writes.run(path, async () => {
      const current = this.#files.get(path) ?? null;
      if (
        options.expected !== undefined &&
        !(await matchesExpected(current, options.expected, webCryptoDigest))
      ) {
        return { status: "changed-on-disk", current };
      }
      this.#files.set(path, content);
      return { status: "written" };
    });
  }

  async remove(path: string): Promise<void> {
    checkPublicWorkspacePath(path);
    await this.#writes.run(path, async () => {
      this.#files.delete(path);
    });
  }

  /**
   * Writes a private entry, such as `.env`, the way a program running in the
   * folder could. Not part of the port, which refuses private paths: tests
   * use it to check a private entry never leaves the folder.
   *
   * @throws RangeError when `path` is unsafe or isn't private
   */
  writePrivate(path: string, content: string): void {
    checkWorkspacePath(path);
    if (!isPrivateWorkspacePath(path)) throw new RangeError(`${path} isn't a private entry.`);
    this.#files.set(path, content);
  }

  /** `sha256:` and the first 16 hex characters of a hash over every path and its text, as in the old adapter. */
  async version(): Promise<string> {
    const paths = [...this.#files.keys()].sort();
    // Kept as in the old adapter: a file whose text contains "\n\0" can make two different workspaces share a version.
    const listing = paths.map((path) => `${path}\n${this.#files.get(path)}`).join("\n\0");
    return `sha256:${(await sha256Hex(listing)).slice(0, 16)}`;
  }

  async watch(listener: DefinitionWatchListener): Promise<DefinitionWatch> {
    this.#listeners.add(listener);
    return {
      close: async () => {
        this.#listeners.delete(listener);
      },
    };
  }

  /**
   * Changes files as another program would, and reports them to every open
   * watch as one batch: a text writes the file, `null` removes it. Private
   * paths change too but are not reported, and a file left as it was isn't
   * either, as a folder's watch would do.
   *
   * @throws RangeError when a path is unsafe
   */
  changeOutside(files: Readonly<Record<string, string | null>>): void {
    const changes: WorkspaceFileChange[] = [];
    for (const [path, content] of Object.entries(files)) {
      checkWorkspacePath(path);
      const before = this.#files.get(path) ?? null;
      if (content === null) {
        this.#files.delete(path);
      } else {
        this.#files.set(path, content);
      }
      if (content !== before && !isPrivateWorkspacePath(path)) {
        changes.push({ path, kind: content === null ? "removed" : "changed" });
      }
    }
    changes.sort((a, b) => (a.path < b.path ? -1 : 1));
    if (changes.length === 0) {
      return;
    }
    for (const listener of this.#listeners) {
      listener.changed(changes);
    }
  }

  /** A copy of every file, by path: what the demo saves and the parity harness compares. */
  snapshot(): Record<string, string> {
    return Object.fromEntries(this.#files);
  }
}
