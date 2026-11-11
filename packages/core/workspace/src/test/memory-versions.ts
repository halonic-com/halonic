import { isPrivateWorkspacePath } from "@halonicjs/ports";
import type { VersionReader } from "../version-source.ts";

/**
 * Commits held in memory, read the way `Vcs.readAt` and `Vcs.listAt` read
 * them, for this package's tests. A deliberate fake: core may not use
 * adapters, not even in tests. Like the port, it never lists a private
 * entry, but it doesn't check paths or ids: the source under test does.
 * It counts every call, so a test can check what was asked of it.
 */
export class MemoryVersions implements VersionReader {
  readonly #commits = new Map<string, ReadonlyMap<string, string>>();
  /** Every `readAt` and `listAt` call, as `read <commit> <path>` or `list <commit> <dir>`. */
  readonly calls: string[] = [];

  /** Adds a commit holding these files and returns its id: 40 hex characters. */
  commit(files: Readonly<Record<string, string>>): string {
    const id = (this.#commits.size + 1).toString(16).padStart(40, "a");
    this.#commits.set(id, new Map(Object.entries(files)));
    return id;
  }

  async readAt(version: string, path: string): Promise<string | null> {
    this.calls.push(`read ${version} ${path}`);
    return this.#filesAt(version).get(path) ?? null;
  }

  async listAt(version: string, dir?: string): Promise<string[] | null> {
    this.calls.push(`list ${version} ${dir ?? ""}`);
    const paths = [...this.#filesAt(version).keys()]
      .filter((path) => !isPrivateWorkspacePath(path))
      .sort();
    if (dir === undefined) {
      return paths;
    }
    const inside = paths.filter((path) => path.startsWith(`${dir}/`));
    return inside.length === 0 ? null : inside;
  }

  #filesAt(version: string): ReadonlyMap<string, string> {
    const files = this.#commits.get(version);
    if (files === undefined) {
      throw new Error(`Unknown version ${version}`);
    }
    return files;
  }
}
