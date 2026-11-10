import {
  checkPublicWorkspacePath,
  type DefinitionSource,
  type DefinitionStore,
  type WriteOptions,
  type WriteResult,
} from "@halonicjs/ports";
import { KeyedQueue, matchesExpected } from "@halonicjs/std";
import { sha256Hex, webCryptoDigest } from "./sha256.ts";

/** One change a {@link DryRunDefinitionStore} was asked to make, in the order it was asked. */
export type PlannedDefinitionChange =
  | { readonly kind: "write"; readonly path: string; readonly content: string }
  | { readonly kind: "remove"; readonly path: string };

/**
 * A dry run of another store: it reads through to that store, but keeps
 * every write and remove in memory and records it, so the real files never
 * change. `changes()` then reports what would have happened, as Compose's
 * `pkg/dryrun` does for its service.
 *
 * Reads see the pending changes, so code that writes a file and reads it
 * back behaves as it would for real. Only the read side of the store under
 * it is ever called, so a read-only {@link DefinitionSource} works too.
 *
 * A write or remove first reads the path from the store under it, so a path
 * that store refuses (for example one through a link) is refused here too.
 * The dry run doesn't predict file system errors beyond that: writing
 * `a.yaml/b.yaml` while `a.yaml` is a file, or writing over a folder, is
 * accepted here even though a real folder would fail.
 */
export class DryRunDefinitionStore implements DefinitionStore {
  readonly location: string;
  readonly #source: DefinitionSource;
  /** The pending text of each changed path; `null` when it would be removed. */
  readonly #pending = new Map<string, string | null>();
  readonly #changes: PlannedDefinitionChange[] = [];
  /**
   * Writes and removes of one path run one after another, so the check for
   * `expected` and the write are never split, not even by a remove.
   */
  readonly #writes = new KeyedQueue();

  /** @param source - the store whose files the dry run starts from; it is only read */
  constructor(source: DefinitionSource) {
    this.#source = source;
    this.location = source.location;
  }

  async list(dir?: string): Promise<string[]> {
    if (dir !== undefined) {
      checkPublicWorkspacePath(dir);
    }
    const paths = new Set(await this.#source.list(dir));
    for (const [path, content] of this.#pending) {
      if (dir !== undefined && !path.startsWith(`${dir}/`)) {
        continue;
      }
      if (content === null) {
        paths.delete(path);
      } else {
        paths.add(path);
      }
    }
    return [...paths].sort();
  }

  async read(path: string): Promise<string | null> {
    checkPublicWorkspacePath(path);
    const pending = this.#pending.get(path);
    if (pending !== undefined) {
      return pending;
    }
    return this.#source.read(path);
  }

  /**
   * Records the write and shows it to later reads; the store under it is
   * not changed. `expected` is checked against what a read would give now,
   * pending changes included, and a write that doesn't match isn't recorded.
   */
  async write(path: string, content: string, options: WriteOptions = {}): Promise<WriteResult> {
    await this.#checkSourceAccepts(path);
    return await this.#writes.run(path, async () => {
      if (options.expected !== undefined) {
        const current = await this.read(path);
        if (!(await matchesExpected(current, options.expected, webCryptoDigest))) {
          return { status: "changed-on-disk", current };
        }
      }
      this.#pending.set(path, content);
      this.#changes.push(Object.freeze({ kind: "write", path, content }));
      return { status: "written" };
    });
  }

  /** Records the removal and hides the file from later reads; the store under it is not changed. */
  async remove(path: string): Promise<void> {
    await this.#checkSourceAccepts(path);
    await this.#writes.run(path, async () => {
      this.#pending.set(path, null);
      this.#changes.push(Object.freeze({ kind: "remove", path }));
    });
  }

  /**
   * Throws when the store under it would refuse the path. Reading is the
   * only way to ask it without changing anything; the text is not needed.
   */
  async #checkSourceAccepts(path: string): Promise<void> {
    checkPublicWorkspacePath(path);
    await this.#source.read(path);
  }

  /**
   * The version of the store under it while nothing is pending. Once
   * something is, `dry-run:` and 16 hex characters of a hash over that
   * version and the pending changes, so it is never mistaken for a version
   * the real store has.
   */
  async version(): Promise<string> {
    const sourceVersion = await this.#source.version();
    if (this.#pending.size === 0) {
      return sourceVersion;
    }
    const paths = [...this.#pending.keys()].sort();
    // JSON keeps a removed file (null) apart from an empty one ("") and any text apart from the separators.
    const listing = JSON.stringify([
      sourceVersion,
      paths.map((path) => [path, this.#pending.get(path)]),
    ]);
    return `dry-run:${(await sha256Hex(listing)).slice(0, 16)}`;
  }

  /** Every write and remove asked for so far, in order: what a real run would have done. Each entry is frozen. */
  changes(): PlannedDefinitionChange[] {
    return [...this.#changes];
  }
}
