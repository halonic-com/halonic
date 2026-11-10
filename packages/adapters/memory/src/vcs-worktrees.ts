import { isPrivateWorkspacePath, type VcsFileDiff, type VcsWorktree } from "@halonicjs/ports";
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

  /**
   * Adds a worktree holding `tree`, the files of commit `version`, without
   * its private entries: a `.env` that HEAD tracks never reaches a worktree.
   */
  add(version: string, tree: Tree): VcsWorktree {
    this.#added++;
    const id = `worktree-${this.#added}`;
    const path = `memory:worktrees/${id}`;
    const worktree = { id, path, version };
    this.#entries.set(id, {
      worktree,
      files: new MemoryDefinitionStore(Object.fromEntries(withoutPrivate(tree)), path),
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
    // The store itself, so tests can write a private entry into it.
    return this.#entry(id).files;
  }

  /**
   * Every file that differs between `base` and the worktree's files, sorted
   * by path. Private entries are left out on both sides, so applying the
   * diff can never delete or change the person's `.env`.
   */
  async diff(base: Tree, id: string): Promise<VcsFileDiff[]> {
    const files = this.#entry(id).files;
    const basePaths = withoutPrivate(base).keys();
    const paths = [...new Set([...basePaths, ...(await files.list())])].sort();
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

function withoutPrivate(tree: Tree): Tree {
  return new Map([...tree].filter(([path]) => !isPrivateWorkspacePath(path)));
}

function statusOf(before: string | null, after: string | null): VcsFileDiff["status"] {
  if (before === null) return "added";
  return after === null ? "deleted" : "modified";
}
