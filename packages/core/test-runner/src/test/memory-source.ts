import type { DefinitionSource } from "@halonicjs/ports";

/**
 * A read-only in-memory `DefinitionSource` for this package's tests. A
 * deliberate fake: core may not use adapters, not even in tests. It holds
 * only safe, public paths, so it skips the port's path checks.
 */
export class MemorySource implements DefinitionSource {
  readonly location = "memory:test-runner";
  private readonly files: Map<string, string>;

  constructor(files: Record<string, string>) {
    this.files = new Map(Object.entries(files));
  }

  async list(): Promise<string[]> {
    return [...this.files.keys()].sort();
  }

  async read(path: string): Promise<string | null> {
    return this.files.get(path) ?? null;
  }

  async version(): Promise<string> {
    return "v1";
  }
}
