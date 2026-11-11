import {
  checkCommitId,
  checkProposalRef,
  type VcsCommitWorktreeOptions,
  type VcsFileDiff,
  type VcsWorktree,
} from "@halonicjs/ports";
import type { ProposalVcs } from "../run-proposal-git-texts.ts";

type Tree = ReadonlyMap<string, string>;

function statusOf(was: string | undefined, is: string | undefined): VcsFileDiff["status"] {
  if (was === undefined) {
    return "added";
  }
  return is === undefined ? "deleted" : "modified";
}

/**
 * The worktree and proposal-ref part of the `Vcs` port, in memory, for the
 * kernel's tests. Commits are whole trees; a worktree is a map of files a
 * test changes as a run would. Ignored files aren't modelled: a test that
 * needs one sets `ignored`.
 */
export class TestProposalVcs implements ProposalVcs {
  readonly commits = new Map<string, Tree>();
  readonly refs = new Map<string, string>();
  readonly worktrees = new Map<
    string,
    { readonly version: string; readonly files: Map<string, string> }
  >();
  /** Paths `commitWorktreeTo` leaves out, as git leaves out ignored files. */
  ignored = new Set<string>();
  private nextCommit = 1;
  private nextWorktree = 1;

  /** Adds a commit holding `files` and gives its id. */
  commit(files: Record<string, string>): string {
    const id = this.nextCommit.toString(16).padStart(40, "0");
    this.nextCommit += 1;
    this.commits.set(id, new Map(Object.entries(files)));
    return id;
  }

  /** A worktree's files, for a test to change as a run would. */
  filesOf(folder: string): Map<string, string> {
    const id = folder.replace("/data/worktrees/", "");
    const worktree = this.worktrees.get(id);
    if (worktree === undefined) {
      throw new Error(`Unknown worktree ${id}`);
    }
    return worktree.files;
  }

  async addWorktree(version: string): Promise<VcsWorktree> {
    const files = new Map(this.treeAt(version));
    const id = `wt${this.nextWorktree}`;
    this.nextWorktree += 1;
    this.worktrees.set(id, { version, files });
    return { id, path: `/data/worktrees/${id}`, version };
  }

  async removeWorktree(id: string): Promise<void> {
    if (!this.worktrees.delete(id)) {
      throw new Error(`Unknown worktree ${id}`);
    }
  }

  async listWorktrees(): Promise<VcsWorktree[]> {
    return [...this.worktrees].map(([id, { version }]) => ({
      id,
      path: `/data/worktrees/${id}`,
      version,
    }));
  }

  async diffBetween(version: string, worktreeId: string): Promise<VcsFileDiff[]> {
    const before = this.treeAt(version);
    const after = this.worktreeFiles(worktreeId);
    const paths = [...new Set([...before.keys(), ...after.keys()])].sort();
    return paths.flatMap((path): VcsFileDiff[] => {
      const was = before.get(path);
      const is = after.get(path);
      if (was === is) {
        return [];
      }
      return [{ path, status: statusOf(was, is), diff: "" }];
    });
  }

  async readAt(version: string, path: string): Promise<string | null> {
    return this.treeAt(version).get(path) ?? null;
  }

  async commitWorktreeTo(
    worktreeId: string,
    ref: string,
    options: VcsCommitWorktreeOptions,
  ): Promise<string> {
    checkProposalRef(ref);
    this.treeAt(options.parent);
    if (this.refs.has(ref)) {
      throw new Error(`Proposal ref ${ref} already exists`);
    }
    const files = [...this.worktreeFiles(worktreeId)].filter(([path]) => !this.ignored.has(path));
    const id = this.commit(Object.fromEntries(files));
    this.refs.set(ref, id);
    return id;
  }

  async readRef(ref: string): Promise<string | null> {
    checkProposalRef(ref);
    return this.refs.get(ref) ?? null;
  }

  async deleteRef(ref: string): Promise<void> {
    checkProposalRef(ref);
    if (!this.refs.delete(ref)) {
      throw new Error(`No proposal ref ${ref}`);
    }
  }

  private treeAt(version: string): Tree {
    checkCommitId(version);
    const tree = this.commits.get(version);
    if (tree === undefined) {
      throw new Error(`Unknown version ${version}`);
    }
    return tree;
  }

  private worktreeFiles(id: string): Map<string, string> {
    const worktree = this.worktrees.get(id);
    if (worktree === undefined) {
      throw new Error(`Unknown worktree ${id}`);
    }
    return worktree.files;
  }
}
