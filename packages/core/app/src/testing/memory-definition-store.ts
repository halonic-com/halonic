import type { DefinitionStore } from "@halonicjs/ports";

/**
 * A small in-memory `DefinitionStore` for the kernel's own tests, with a
 * hook to make a write fail and a log of what was written. A deliberate
 * fake: core may not use adapters, not even in tests, so the memory adapter
 * is out of reach. It passes the `DefinitionStore` contract suite, so it
 * keeps the port's rules, unsafe paths included.
 */
export class TestDefinitionStore implements DefinitionStore {
  readonly location = "memory:test";
  readonly files: Map<string, string>;
  /** Paths written or removed, in order, such as "write a.yaml". */
  readonly log: string[] = [];
  /** A write or remove of this path throws. */
  failOn: string | null = null;
  private saves = 0;

  constructor(files: Record<string, string> = {}) {
    this.files = new Map(Object.entries(files));
  }

  async list(dir?: string): Promise<string[]> {
    if (dir !== undefined) {
      checkPath(dir);
    }
    const prefix = dir === undefined ? "" : `${dir}/`;
    return [...this.files.keys()].filter((path) => path.startsWith(prefix)).sort();
  }

  async read(path: string): Promise<string | null> {
    checkPath(path);
    return this.files.get(path) ?? null;
  }

  async version(): Promise<string> {
    return `v${this.saves}`;
  }

  async write(path: string, content: string): Promise<void> {
    this.check(path);
    this.log.push(`write ${path}`);
    this.files.set(path, content);
    this.saves++;
  }

  async remove(path: string): Promise<void> {
    this.check(path);
    this.log.push(`remove ${path}`);
    this.files.delete(path);
    this.saves++;
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
 * `.`, `..` or empty segment, or with a backslash or NUL.
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
}
