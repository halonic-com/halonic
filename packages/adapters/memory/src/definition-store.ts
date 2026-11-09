import {
  checkPublicWorkspacePath,
  checkWorkspacePath,
  type DefinitionStore,
  isPrivateWorkspacePath,
} from "@halonicjs/ports";
import { sha256Hex } from "./sha256.ts";

/**
 * Workspace files in a map: for tests, the browser demo and the parity
 * harness. Paths are checked like every other store's (see the port). It may
 * start with private entries, such as `.env`, as a folder can hold them, but
 * it never serves or lists them.
 */
export class MemoryDefinitionStore implements DefinitionStore {
  readonly location: string;
  readonly #files = new Map<string, string>();

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

  async write(path: string, content: string): Promise<void> {
    checkPublicWorkspacePath(path);
    this.#files.set(path, content);
  }

  async remove(path: string): Promise<void> {
    checkPublicWorkspacePath(path);
    this.#files.delete(path);
  }

  /** `sha256:` and the first 16 hex characters of a hash over every path and its text, as in the old adapter. */
  async version(): Promise<string> {
    const paths = [...this.#files.keys()].sort();
    // Kept as in the old adapter: a file whose text contains "\n\0" can make two different workspaces share a version.
    const listing = paths.map((path) => `${path}\n${this.#files.get(path)}`).join("\n\0");
    return `sha256:${(await sha256Hex(listing)).slice(0, 16)}`;
  }

  /** A copy of every file, by path: what the demo saves and the parity harness compares. */
  snapshot(): Record<string, string> {
    return Object.fromEntries(this.#files);
  }
}
