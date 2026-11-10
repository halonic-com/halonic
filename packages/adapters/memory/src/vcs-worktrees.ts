import type { VcsFileDiff, VcsWorktree } from "@halonicjs/ports";
import { MemoryDefinitionStore } from "./definition-store.ts";
import { unifiedDiff } from "./line-diff.ts";
import type { Tree } from "./vcs-repository.ts";

interface Entry {
  worktree: VcsWorktree;
  files: MemoryDefinitionStore;
}

/**
 * The memory Vcs's worktrees: each one a commit's files in a store of its
 * own, which tests and the demo change through `MemoryVcs.worktreeFiles`.
 * Its folder, `memory:worktrees/<id>`, is a name only; there is no disk.
 */
export class MemoryWorktrees {
  readonly #entries = new Map<string, Entry>();
  #added = 0;

  /** Adds a worktree holding `tree`, the files of commit `version`. */
  add(version: string, tree: Tree): VcsWorktree {
    this.#added++;
    const id = `worktree-${this.#added}`;
    const worktree = { id, path: `memory:worktrees/${id}`, version };
    this.#entries.set(id, {
      worktree,
      files: new MemoryDefinitionStore(Object.fromEntries(tree)),
    });
    return { ...worktree };
  }

  remove(id: string): void {
    this.#entry(id);
    this.#entries.delete(id);
  }

  list(): VcsWorktree[] {
    return [...this.#entries.values()].map((entry) => ({ ...entry.worktree }));
  }

  files(id: string): MemoryDefinitionStore {
    return this.#entry(id).files;
  }

  /** Every file that differs between `base` and the worktree's files, sorted by path. */
  async diff(base: Tree, id: string): Promise<VcsFileDiff[]> {
    const files = this.#entry(id).files;
    const paths = [...new Set([...base.keys(), ...(await files.list())])].sort();
    const diffs: VcsFileDiff[] = [];
    for (const path of paths) {
      const before = base.get(path) ?? null;
      const after = await files.read(path);
      if (before === after) continue;
      diffs.push({ path, status: statusOf(before, after), diff: unifiedDiff(path, before, after) });
    }
    return diffs;
  }

  #entry(id: string): Entry {
    const entry = this.#entries.get(id);
    if (entry === undefined) throw new Error(`Unknown worktree ${id}.`);
    return entry;
  }
}

function statusOf(before: string | null, after: string | null): VcsFileDiff["status"] {
  if (before === null) return "added";
  return after === null ? "deleted" : "modified";
}
