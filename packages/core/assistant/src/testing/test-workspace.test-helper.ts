// A workspace in memory for the Build chat's tests, with a review service
// over it. A deliberate fake: core may not use adapters, not even in tests.

import { ReviewService, type Trash } from "@halonicjs/app";
import {
  checkPublicWorkspacePath,
  checkWorkspacePath,
  type DefinitionStore,
  type DefinitionWatch,
  type Digest,
  type ExpectedContent,
  isPrivateWorkspacePath,
  type WriteOptions,
} from "@halonicjs/ports";
import { contentDigest, matchesExpected } from "@halonicjs/std";

/** SHA-256 from Web Crypto, as the platform's `Digest` adapter gives it. */
export const digest: Digest = {
  async sha256(data) {
    return new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(data)));
  },
};

/** The digest the store compares for `text`. */
export const digestOf = (text: string) => contentDigest(text, digest);

/**
 * A `DefinitionStore` in memory that keeps the port's rules: it refuses
 * unsafe and private paths, and a path under one of `links` as a store
 * refuses a path through a symbolic link, and lists neither.
 */
export class TestStore implements DefinitionStore {
  readonly location = "memory:acme";
  readonly files: Map<string, string>;
  /** Paths that are symbolic links, as on disk. */
  readonly links = new Set<string>();

  constructor(files: Record<string, string> = {}) {
    this.files = new Map(Object.entries(files));
  }

  async list(dir?: string): Promise<string[]> {
    if (dir !== undefined) {
      this.check(dir);
    }
    const prefix = dir === undefined ? "" : `${dir}/`;
    return [...this.files.keys()]
      .filter((path) => path.startsWith(prefix))
      .filter((path) => !isPrivateWorkspacePath(path) && !this.throughLink(path))
      .sort();
  }

  async read(path: string): Promise<string | null> {
    this.check(path);
    return this.files.get(path) ?? null;
  }

  async version(): Promise<string> {
    return "v1";
  }

  async write(path: string, content: string, options: WriteOptions = {}) {
    this.check(path);
    const current = this.files.get(path) ?? null;
    if (!(await this.holds(current, options.expected))) {
      return { status: "changed-on-disk", current } as const;
    }
    this.files.set(path, content);
    return { status: "written" } as const;
  }

  async remove(path: string) {
    this.check(path);
    this.files.delete(path);
    return { status: "removed" } as const;
  }

  async watch(): Promise<DefinitionWatch> {
    return { close: async () => {} };
  }

  private check(path: string): void {
    checkWorkspacePath(path);
    checkPublicWorkspacePath(path);
    if (this.throughLink(path)) {
      throw new RangeError(`${path} goes through a symbolic link.`);
    }
  }

  private throughLink(path: string): boolean {
    return [...this.links].some((link) => path === link || path.startsWith(`${link}/`));
  }

  private async holds(current: string | null, expected: ExpectedContent | undefined) {
    if (expected === undefined) {
      return true;
    }
    return current === null ? expected === "absent" : matchesExpected(current, expected, digest);
  }
}

/** A trash in memory: it keeps what it moves out of the store until it is put back. */
class TestTrash implements Trash {
  private readonly store: TestStore;
  private readonly entries = new Map<string, { path: string; content: string }>();

  constructor(store: TestStore) {
    this.store = store;
  }

  async moveToTrash(path: string, expected?: ExpectedContent) {
    const current = await this.store.read(path);
    if (current === null || (expected !== undefined && (await digestOf(current)) !== expected)) {
      return { status: "changed-on-disk", current } as const;
    }
    const trashId = `trash-${this.entries.size + 1}`;
    this.entries.set(trashId, { path, content: current });
    await this.store.remove(path);
    return { status: "done", trashId } as const;
  }

  async restore() {
    return { status: "missing" } as const;
  }
}

/** A workspace "acme" with its review service, trusted or not as `trust.trusted` says at each call. */
export function testWorkspace(files: Record<string, string>, trusted = true) {
  const store = new TestStore(files);
  const trust = { trusted };
  const review = new ReviewService({
    store,
    records: new TestStore(),
    digest,
    trash: new TestTrash(store),
    isTrusted: () => trust.trusted,
  });
  return { store, trust, review };
}
