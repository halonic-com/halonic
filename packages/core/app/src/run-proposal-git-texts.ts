// A run's texts with history on (HAL-3248): the run writes in a worktree of
// its own, and what it changed is committed onto its proposal ref, with its
// version as parent. Internal to `core/app`.

import type { Digest, Vcs } from "@halonicjs/ports";
import { contentDigest } from "@halonicjs/std";
import { type HistoryOnRunningRecord, proposalRefOf } from "./run-proposal-record.ts";
import type {
  KeptTexts,
  ProposalReader,
  RecordedRuns,
  WithoutItems,
} from "./run-proposal-texts.ts";
import {
  type HistoryOnProposal,
  ProposalUnavailableError,
  type ProposedFile,
} from "./run-proposal-types.ts";

/** The part of the `Vcs` port the proposal service uses. */
export type ProposalVcs = Pick<
  Vcs,
  | "addWorktree"
  | "removeWorktree"
  | "listWorktrees"
  | "diffBetween"
  | "readAt"
  | "commitWorktreeTo"
  | "readRef"
  | "deleteRef"
>;

/** The texts of runs in worktrees, kept on proposal refs. */
export class GitProposalTexts implements KeptTexts<HistoryOnRunningRecord, HistoryOnProposal> {
  private readonly vcs: ProposalVcs;
  private readonly digest: Digest;

  constructor(vcs: ProposalVcs, digest: Digest) {
    this.vcs = vcs;
    this.digest = digest;
  }

  /** Adds the run's worktree at its version (`app.run-proposal-worktree`). */
  async open(
    runId: string,
    version: string,
  ): Promise<{ folder: string; record: HistoryOnRunningRecord }> {
    const worktree = await this.vcs.addWorktree(version);
    return {
      folder: worktree.path,
      record: { state: "running", history: "git", runId, base: version, worktreeId: worktree.id },
    };
  }

  async folderOf(record: HistoryOnRunningRecord): Promise<string | null> {
    const worktrees = await this.vcs.listWorktrees();
    return worktrees.find((worktree) => worktree.id === record.worktreeId)?.path ?? null;
  }

  /**
   * Commits the worktree onto the run's ref and works out the proposal
   * from that commit, not from the worktree's diff: the commit leaves out
   * files the repository ignores, and so does the proposal.
   */
  async end(record: HistoryOnRunningRecord): Promise<WithoutItems<HistoryOnProposal> | null> {
    const { runId, base, worktreeId } = record;
    const changed = await this.vcs.diffBetween(base, worktreeId);
    if (changed.length === 0) {
      return null;
    }
    const ref = proposalRefOf(runId);
    const commit = await this.vcs.commitWorktreeTo(worktreeId, ref, { parent: base });
    const files: ProposedFile[] = [];
    for (const { path } of changed) {
      const file = await this.proposedFile(path, base, commit);
      if (file !== null) {
        files.push(file);
      }
    }
    if (files.length === 0) {
      await this.vcs.deleteRef(ref);
      return null;
    }
    return { runId, history: "git", base, ref, files };
  }

  async close(record: HistoryOnRunningRecord): Promise<void> {
    await this.vcs.removeWorktree(record.worktreeId);
  }

  async readerOf(proposal: HistoryOnProposal): Promise<ProposalReader> {
    const commit = await this.vcs.readRef(proposal.ref);
    if (commit === null) {
      throw new ProposalUnavailableError(proposal.runId);
    }
    return {
      read: (side, path) => this.vcs.readAt(side === "base" ? proposal.base : commit, path),
    };
  }

  async isAvailable(proposal: HistoryOnProposal): Promise<boolean> {
    return (await this.vcs.readRef(proposal.ref)) !== null;
  }

  async release(proposal: HistoryOnProposal): Promise<void> {
    await this.deleteRefIfThere(proposal.ref);
  }

  async discard(record: HistoryOnRunningRecord): Promise<void> {
    await this.deleteRefIfThere(proposalRefOf(record.runId));
  }

  /** Removes every worktree but those of running runs. A proposal's ref is not a leftover. */
  async removeLeftovers({ running }: RecordedRuns<HistoryOnRunningRecord>): Promise<void> {
    const keptIds = new Set(running.map((record) => record.worktreeId));
    for (const worktree of await this.vcs.listWorktrees()) {
      if (!keptIds.has(worktree.id)) {
        await this.vcs.removeWorktree(worktree.id);
      }
    }
  }

  private async deleteRefIfThere(ref: string): Promise<void> {
    if ((await this.vcs.readRef(ref)) !== null) {
      await this.vcs.deleteRef(ref);
    }
  }

  /** How a file differs between the base and the run's commit; `null` when it doesn't. */
  private async proposedFile(
    path: string,
    base: string,
    commit: string,
  ): Promise<ProposedFile | null> {
    const before = await this.vcs.readAt(base, path);
    const after = await this.vcs.readAt(commit, path);
    if (before === after) {
      return null;
    }
    if (before === null) {
      return { path, change: "added", base: "absent" };
    }
    const digest = await contentDigest(before, this.digest);
    return { path, change: after === null ? "deleted" : "modified", base: { digest } };
  }
}
