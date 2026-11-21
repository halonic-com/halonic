import {
  type DefinitionSource,
  isLeftOut,
  type ListOptions,
  type VersionOptions,
} from "@halonicjs/ports";

/**
 * An in-memory `DefinitionSource` for this package's tests that lists by
 * folder and leaves out what `leaveOut` names, as every store does, and
 * keeps a log of the paths it read and listed. Its version is made of the
 * listed files' paths and texts, so it changes exactly when they do. A
 * deliberate fake: core may not use adapters, not even in tests.
 */
export class LeftOutSource implements DefinitionSource {
  readonly location = "memory:acme";
  readonly files: Map<string, string>;
  /** Every path `read` was asked for, in order. */
  readonly reads: string[] = [];
  /** Every path a `list` gave, in order. */
  readonly listed: string[] = [];

  constructor(files: Record<string, string>) {
    this.files = new Map(Object.entries(files));
  }

  async list(dir?: string, options: ListOptions = {}): Promise<string[]> {
    const paths = [...this.files.keys()]
      .filter((path) => dir === undefined || path.startsWith(`${dir}/`))
      .filter((path) => !isLeftOut(path, options.leaveOut))
      .sort();
    this.listed.push(...paths);
    return paths;
  }

  async read(path: string): Promise<string | null> {
    this.reads.push(path);
    return this.files.get(path) ?? null;
  }

  async version(options: VersionOptions = {}): Promise<string> {
    const paths = [...this.files.keys()]
      .filter((path) => !isLeftOut(path, options.leaveOut))
      .sort();
    return JSON.stringify(paths.map((path) => [path, this.files.get(path)]));
  }
}
