import type { DefinitionSource } from "@halonicjs/ports";

/**
 * A read-only in-memory `DefinitionSource` for this package's tests. A
 * deliberate fake: core may not use adapters, not even in tests. It holds
 * only safe, public paths, so it skips the port's path checks.
 */
export class MemorySource implements DefinitionSource {
  readonly location = "memory:test-runner";
  private readonly files: Map<string, string>;
  /** Paths `list` gives although `read` finds no file, as when one is removed in between. */
  private readonly vanished: readonly string[];

  constructor(files: Record<string, string>, vanished: readonly string[] = []) {
    this.files = new Map(Object.entries(files));
    this.vanished = vanished;
  }

  async list(): Promise<string[]> {
    return [...this.files.keys(), ...this.vanished].sort();
  }

  async read(path: string): Promise<string | null> {
    return this.files.get(path) ?? null;
  }

  async version(): Promise<string> {
    return "v1";
  }
}
