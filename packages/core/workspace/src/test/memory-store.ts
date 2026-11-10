import type { DefinitionStore, DefinitionWatch, WriteResult } from "@halonicjs/ports";

/**
 * An in-memory `DefinitionStore` for this package's tests, with a log of what
 * was written and a hook to make a write fail. A deliberate fake: core may
 * not use adapters, not even in tests. It holds only safe, public paths, so
 * it skips the port's path checks.
 */
export class MemoryStore implements DefinitionStore {
  readonly location = "memory:acme";
  readonly files: Map<string, string>;
  /** Paths written, in order. */
  readonly written: string[] = [];
  /** A write of this path throws. */
  failOn: string | null = null;

  constructor(files: Record<string, string> = {}) {
    this.files = new Map(Object.entries(files));
  }

  async list(): Promise<string[]> {
    return [...this.files.keys()].sort();
  }

  async read(path: string): Promise<string | null> {
    return this.files.get(path) ?? null;
  }

  async version(): Promise<string> {
    return `v${this.written.length}`;
  }

  /** Always writes: this package only lays out new workspaces, so it never passes `expected`. */
  async write(path: string, content: string): Promise<WriteResult> {
    if (path === this.failOn) {
      throw new Error(`cannot write ${path}`);
    }
    this.written.push(path);
    this.files.set(path, content);
    return { status: "written" };
  }

  async remove(path: string): Promise<void> {
    this.files.delete(path);
  }

  /** Reports nothing: only the tests change these files. */
  async watch(): Promise<DefinitionWatch> {
    return { close: async () => {} };
  }
}
