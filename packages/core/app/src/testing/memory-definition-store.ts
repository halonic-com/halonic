import type { DefinitionStore } from "@halonicjs/ports";

/**
 * A small in-memory `DefinitionStore` for the kernel's own tests, with a
 * hook to make a write fail. It is replaced by the memory adapter from
 * `@halonicjs/adapter-memory` once that is on this package's base.
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
    const prefix = dir === undefined ? "" : `${dir}/`;
    return [...this.files.keys()].filter((path) => path.startsWith(prefix)).sort();
  }

  async read(path: string): Promise<string | null> {
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
    if (path === this.failOn) {
      throw new Error(`cannot write ${path}`);
    }
  }
}
