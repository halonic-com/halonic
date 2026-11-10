import type { DefinitionStore, Digest, ExpectedContent } from "@halonicjs/ports";
import { matchesExpected } from "@halonicjs/std";
import type { Trash } from "../review-types.ts";

/**
 * A trash in memory for the kernel's tests, over a workspace store: it
 * keeps what it moves out of the store, by entry id, until it is put back.
 */
export class TestTrash implements Trash {
  /** What the trash holds, by entry id. */
  readonly entries = new Map<string, { readonly path: string; readonly content: string }>();
  private readonly store: DefinitionStore;
  private readonly digest: Digest;
  private nextId = 1;

  constructor(store: DefinitionStore, digest: Digest) {
    this.store = store;
    this.digest = digest;
  }

  async moveToTrash(path: string, expected?: ExpectedContent) {
    const current = await this.store.read(path);
    if (
      current === null ||
      (expected !== undefined && !(await matchesExpected(current, expected, this.digest)))
    ) {
      return { status: "changed-on-disk", current } as const;
    }
    const trashId = `trash-${this.nextId++}`;
    this.entries.set(trashId, { path, content: current });
    await this.store.remove(path);
    return { status: "done", trashId } as const;
  }

  async restore(trashId: string) {
    const entry = this.entries.get(trashId);
    if (entry === undefined) {
      return { status: "missing" } as const;
    }
    const current = await this.store.read(entry.path);
    if (current !== null) {
      return { status: "occupied", current } as const;
    }
    await this.store.write(entry.path, entry.content);
    this.entries.delete(trashId);
    return { status: "done" } as const;
  }
}
