import type { DefinitionStore, WriteOptions, WriteResult } from "@halonicjs/ports";
import { KeyedQueue, matchesExpected, type Sha256 } from "@halonicjs/std";

/**
 * A small in-memory `DefinitionStore` for the kernel's own tests, with a
 * hook to make a write fail and a log of what was written. A deliberate
 * fake: core may not use adapters, not even in tests, so the memory adapter
 * is out of reach. It passes the `DefinitionStore` contract suite, so it
 * keeps the port's rules, unsafe and private paths included. Like a folder,
 * it may start with private entries, but it never serves or lists them.
 */
export class TestDefinitionStore implements DefinitionStore {
  readonly location = "memory:test";
  readonly files: Map<string, string>;
  /** Paths written or removed, in order, such as "write a.yaml". */
  readonly log: string[] = [];
  /** A write or remove of this path throws. */
  failOn: string | null = null;
  private saves = 0;
  private readonly digest: Sha256 | null;
  /**
   * Writes and removes of one path run one after another, so the check for
   * `expected` and the write are never split, not even by a remove.
   */
  private readonly writes = new KeyedQueue();

  /**
   * @param files - the files to start with, by relative path
   * @param digest - hashes text for a write with `expected`; core has no hash
   *   of its own, so a test that writes with `expected` passes one in
   */
  constructor(files: Record<string, string> = {}, digest: Sha256 | null = null) {
    this.files = new Map(Object.entries(files));
    this.digest = digest;
  }

  async list(dir?: string): Promise<string[]> {
    if (dir !== undefined) {
      checkPath(dir);
    }
    const prefix = dir === undefined ? "" : `${dir}/`;
    return [...this.files.keys()]
      .filter((path) => path.startsWith(prefix) && !isPrivatePath(path))
      .sort();
  }

  async read(path: string): Promise<string | null> {
    checkPath(path);
    return this.files.get(path) ?? null;
  }

  async version(): Promise<string> {
    return `v${this.saves}`;
  }

  async write(path: string, content: string, options: WriteOptions = {}): Promise<WriteResult> {
    this.check(path);
    const { expected } = options;
    if (expected !== undefined && this.digest === null) {
      throw new Error("TestDefinitionStore needs a digest to write with `expected`.");
    }
    return await this.writes.run(path, async () => {
      if (expected !== undefined && this.digest !== null) {
        const current = this.files.get(path) ?? null;
        if (!(await matchesExpected(current, expected, this.digest))) {
          return { status: "changed-on-disk", current };
        }
      }
      this.log.push(`write ${path}`);
      this.files.set(path, content);
      this.saves++;
      return { status: "written" };
    });
  }

  async remove(path: string): Promise<void> {
    this.check(path);
    await this.writes.run(path, async () => {
      this.log.push(`remove ${path}`);
      this.files.delete(path);
      this.saves++;
    });
  }

  private check(path: string): void {
    checkPath(path);
    if (path === this.failOn) {
      throw new Error(`cannot write ${path}`);
    }
  }
}

/**
 * Refuses a path the `DefinitionSource` port calls unsafe: absolute, with a
 * `.`, `..` or empty segment, or with a backslash or NUL. Refuses a private
 * path too.
 *
 * @throws RangeError naming the path
 */
function checkPath(path: string): void {
  const unsafe =
    path.includes("\\") ||
    path.includes("\u0000") ||
    path.startsWith("/") ||
    path.split("/").some((segment) => segment === "" || segment === "." || segment === "..");
  if (unsafe) {
    throw new RangeError(`Unsafe workspace path ${JSON.stringify(path)}.`);
  }
  if (isPrivatePath(path)) {
    throw new RangeError(`Private workspace path ${JSON.stringify(path)}.`);
  }
}

/** Code points HFS+ ignores in a name, as in git's `next_hfs_char`. */
const hfsIgnored = /[\u200C-\u200F\u202A-\u202E\u206A-\u206F\uFEFF]/gu;

/** Whether a path has a segment the port calls private (see the port doc). */
function isPrivatePath(path: string): boolean {
  return path.split("/").some((segment) => {
    if (segment.includes(":") || /~\d/u.test(segment)) {
      return true;
    }
    const name = segment
      .replace(hfsIgnored, "")
      // Upper case first, so letters that fold to ASCII on some file system match
      // too: a long s to `s`, an `st` ligature to `st`, a dotless i to `i`.
      .toUpperCase()
      .toLowerCase()
      .replace(/[. ]+$/u, "");
    return [".git", ".studio", ".env", ".envrc"].includes(name) || name.startsWith(".env.");
  });
}
