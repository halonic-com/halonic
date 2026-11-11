// Run proposals (save model 7, AI changes 2, HAL-3248): a run that can
// change workspace files changes them in a worktree of its own, and what it
// changed becomes a proposal the person accepts or rejects from the Inbox.
// Nothing here commits to a branch, pushes or makes anything live (7.6).

import type { Clock, DefinitionStore, Digest, Vcs } from "@halonicjs/ports";
import { contentDigest } from "@halonicjs/std";
import { placeOf } from "@halonicjs/workspace";
import type { Trash } from "./review-types.ts";
import { ProposalDecisions } from "./run-proposal-decisions.ts";
import { type ProposedRecord, proposalRefOf } from "./run-proposal-record.ts";
import { ProposalRecordStore } from "./run-proposal-store.ts";
import type {
  AcceptResult,
  CompareTexts,
  ProposalTarget,
  ProposedFile,
  RejectResult,
  RestoreResult,
  RunProposal,
  UndoStep,
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

/** What the run proposal service needs from the host. */
export interface RunProposalsOptions {
  /** The workspace's version control. Its worktrees go in Halonic's data folder, never in the workspace. */
  readonly vcs: ProposalVcs;
  /**
   * The records' own store, in the workspace's folder in the profile, as
   * for review records. Never the workspace's store: git could bring a
   * record in from there (HAL-3417).
   */
  readonly records: DefinitionStore;
  /** Hashes each file's base for the write-if-unchanged check. */
  readonly digest: Digest;
  /** Dates a proposal, so its ref can go after 30 days. */
  readonly clock: Clock;
  /**
   * Receives the error of an `end` that couldn't finish. `end` never
   * throws: the engine calls it after the run has ended, in the middle of
   * a cancel or a parent's step. What it left is cleared at the next start.
   */
  readonly onEndFailed: (runId: string, error: unknown) => void;
  /** The workspace's files, which Accept writes. */
  readonly store: DefinitionStore;
  /** Where Accept of a file the run deleted moves it, so Undo can bring it back. */
  readonly trash: Trash;
}

/** What `open` gives the harness. */
export interface RunWorktree {
  /** The only folder the run may write workspace files in: absolute, outside the workspace. */
  readonly folder: string;
}

/**
 * The proposals of one workspace's runs. One worktree per top-level run:
 * its workflow steps and calls to other agents share it.
 *
 * @example
 * const proposals = new RunProposals({ vcs, records, digest, clock, onEndFailed, store, trash });
 * const { folder } = await proposals.open("01JD8Q", version); // the harness writes only here
 * await proposals.folderOf("01JD8Q"); // the same folder, after a restart too
 * const proposal = await proposals.end("01JD8Q"); // emit run.proposal when not null
 * const { undo, changedOnDisk } = await proposals.accept("01JD8Q", "all");
 * if (undo !== null) await proposals.restore(undo, "before"); // Undo
 */
export class RunProposals {
  private readonly vcs: ProposalVcs;
  private readonly records: ProposalRecordStore;
  private readonly digest: Digest;
  private readonly clock: Clock;
  private readonly onEndFailed: (runId: string, error: unknown) => void;
  private readonly decisions: ProposalDecisions;

  constructor(options: RunProposalsOptions) {
    this.vcs = options.vcs;
    this.records = new ProposalRecordStore(options.records);
    this.digest = options.digest;
    this.clock = options.clock;
    this.onEndFailed = options.onEndFailed;
    this.decisions = new ProposalDecisions(this.records, {
      vcs: options.vcs,
      store: options.store,
      digest: options.digest,
      trash: options.trash,
    });
  }

  /**
   * Adds the run's worktree at its version (`app.run-proposal-worktree`)
   * and records it, so a worktree left by a crash is found at start.
   *
   * @param version - the commit the run's definitions are read from
   * @throws RangeError for a run id that can't name a proposal ref
   * @throws when the run already has a record
   */
  async open(runId: string, version: string): Promise<RunWorktree> {
    return await this.records.inTurn(runId, async () => {
      if ((await this.records.read(runId)) !== null) {
        throw new Error(`Run ${runId} already has a worktree or a proposal.`);
      }
      const worktree = await this.vcs.addWorktree(version);
      await this.records.save({ state: "running", runId, base: version, worktreeId: worktree.id });
      return { folder: worktree.path };
    });
  }

  /**
   * The folder of a run whose worktree is open, also after a restart: a
   * run can wait for a person across one, and its next step needs the same
   * folder (`app.run-proposal-worktree`).
   *
   * @returns the folder, or `null` when the run has no open worktree
   * @throws RangeError for a run id that can't name a proposal ref
   */
  folderOf(runId: string): Promise<string | null> {
    return this.records.inTurn(runId, async () => {
      const record = await this.records.read(runId);
      if (record?.state !== "running") {
        return null;
      }
      const worktrees = await this.vcs.listWorktrees();
      return worktrees.find((worktree) => worktree.id === record.worktreeId)?.path ?? null;
    });
  }

  /**
   * Ends the run's worktree, whether the run finished, failed or was
   * cancelled (`app.run-proposal-end`). When it changed files, they are
   * committed onto the run's proposal ref, with its version as parent, and
   * the proposal is recorded with every file undecided. The worktree goes
   * either way. Never throws: an end that can't finish goes to
   * `onEndFailed`, and the next start clears what it left.
   *
   * @returns the proposal, for `run.proposal`, or `null` when nothing
   * changed, the run has no worktree, or the end couldn't finish
   */
  async end(runId: string): Promise<RunProposal | null> {
    try {
      return await this.records.inTurn(runId, () => this.endWorktree(runId));
    } catch (error) {
      this.onEndFailed(runId, error);
      return null;
    }
  }

  private async endWorktree(runId: string): Promise<RunProposal | null> {
    const record = await this.records.read(runId);
    if (record?.state !== "running") {
      // A run that never had a folder, or one that already ended.
      return null;
    }
    const proposal = await this.commitChanges(record.runId, record.base, record.worktreeId);
    if (proposal === null) {
      await this.records.remove(runId);
    } else {
      await this.records.save({
        state: "proposed",
        proposal,
        finishedAt: this.clock.now().toISOString(),
        decisions: Object.fromEntries(proposal.files.map((file) => [file.path, "undecided"])),
      });
    }
    // The record is saved first: a crash now leaves only the worktree, which `removeLeftovers` removes.
    try {
      await this.vcs.removeWorktree(record.worktreeId);
    } catch (error) {
      // The proposal is saved, so the run still reports it.
      this.onEndFailed(runId, error);
    }
    return proposal;
  }

  /** The proposal of a run that ended with changes, or `null`. */
  async get(runId: string): Promise<ProposedRecord | null> {
    const record = await this.records.read(runId);
    return record?.state === "proposed" ? record : null;
  }

  /**
   * Accepts what the target covers (`app.run-proposal-accept`,
   * `app.run-proposal-trust`). Each undecided file is written with its own
   * `expected`, only while the saved file is still the run's base; one the
   * person changed since is listed in `changedOnDisk`, for Compare, and
   * stays undecided. A file under `.git/` or `.halonic/`, or one the store
   * won't serve (through a symlink, say), is refused and becomes not
   * applicable. Accepting starts nothing: no run, routine, hook or tool.
   *
   * @returns what was written, with the decisions record, as one undo
   *   step; `undo` is `null` when no file was written, even if decisions
   *   changed (a refused file, or one already as the run left it)
   * @throws when the run has no proposal, or its ref is gone
   */
  accept(runId: string, target: ProposalTarget): Promise<AcceptResult> {
    return this.decisions.accept(runId, target);
  }

  /**
   * Rejects what the target covers (`app.run-proposal-reject`): each
   * undecided file becomes rejected; the saved files stay as they are.
   *
   * @returns the decisions record, before and after, as one undo step
   * @throws when the run has no proposal
   */
  reject(runId: string, target: ProposalTarget): Promise<RejectResult> {
    return this.decisions.reject(runId, target);
  }

  /**
   * The texts Compare shows for a file of the proposal: the run's base,
   * the saved file and the run's.
   *
   * @throws when the run has no proposal, its ref is gone, or it doesn't propose the file
   */
  compare(runId: string, path: string): Promise<CompareTexts> {
    return this.decisions.compare(runId, path);
  }

  /**
   * Puts the files and decisions of a step from {@link accept} or
   * {@link reject} back as they were `before` it (Undo) or `after` it
   * (Redo). Each entry is written only while it is still as the step left
   * it, so an edit made since is never lost: it is listed in `changedOnDisk`.
   * Trust rule A holds as for Accept (`app.run-proposal-trust`): an entry
   * Accept could never write is listed under `refused` and left alone.
   */
  restore(step: UndoStep, to: "before" | "after"): Promise<RestoreResult> {
    return this.decisions.restore(step, to);
  }

  /**
   * Removes what runs left that the engine has ended, from a crash or an
   * `end` that couldn't finish: their worktrees, records and proposal refs,
   * and every worktree no open run records. The worktrees of `openRuns`
   * stay for `folderOf`. Call it at start, before any run can open a
   * worktree.
   *
   * @param openRuns - the runs the engine hasn't ended: those waiting for a
   * person, and those it will end as interrupted
   */
  async removeLeftovers(openRuns: ReadonlySet<string>): Promise<void> {
    const kept = new Set<string>();
    for (const runId of await this.records.running()) {
      if (openRuns.has(runId)) {
        const record = await this.records.read(runId);
        if (record?.state === "running") {
          kept.add(record.worktreeId);
        }
        continue;
      }
      const ref = proposalRefOf(runId);
      if ((await this.vcs.readRef(ref)) !== null) {
        await this.vcs.deleteRef(ref);
      }
      await this.records.remove(runId);
    }
    for (const worktree of await this.vcs.listWorktrees()) {
      if (!kept.has(worktree.id)) {
        await this.vcs.removeWorktree(worktree.id);
      }
    }
  }

  /**
   * Commits the worktree onto the run's ref and works out the proposal
   * from that commit, not from the worktree's diff: the commit leaves out
   * files the repository ignores, and so does the proposal.
   */
  private async commitChanges(
    runId: string,
    base: string,
    worktreeId: string,
  ): Promise<RunProposal | null> {
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
    return { runId, base, ref, files, items: itemsOf(files) };
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

/** The ids of the items the files belong to, each once, in path order. */
function itemsOf(files: readonly ProposedFile[]): string[] {
  const items = new Set<string>();
  for (const { path } of files) {
    // A file no kind places (a README), or one with no id of its own, belongs to no item.
    const placeId = placeOf(path)?.placeId;
    if (placeId !== undefined) {
      items.add(placeId);
    }
  }
  return [...items];
}
