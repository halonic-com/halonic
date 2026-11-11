// Run proposals (save model 7, AI changes 2, HAL-3248): a run that can
// change workspace files changes them in a worktree of its own, and what it
// changed becomes a proposal the person accepts or rejects from the Inbox.
// Nothing here commits to a branch, pushes or makes anything live (7.6).

import type { Clock, DefinitionStore, Digest } from "@halonicjs/ports";
import { placeOf } from "@halonicjs/workspace";
import type { Trash } from "./review-types.ts";
import { CopyProposalTexts, type RunCopies } from "./run-proposal-copy-texts.ts";
import { ProposalDecisions } from "./run-proposal-decisions.ts";
import { GitProposalTexts, type ProposalVcs } from "./run-proposal-git-texts.ts";
import { ProposalParts } from "./run-proposal-parts.ts";
import type { ProposedRecord, RunningRecord } from "./run-proposal-record.ts";
import { ProposalSettling, type SettleResult } from "./run-proposal-settle.ts";
import { ProposalRecordStore } from "./run-proposal-store.ts";
import type { ProposalTexts } from "./run-proposal-texts.ts";
import { ProposalTextsByHistory } from "./run-proposal-texts-by-history.ts";
import type {
  AcceptResult,
  CompareTexts,
  InFileProposalTarget,
  InFileResult,
  ProposalFileParts,
  ProposalTarget,
  ProposedFile,
  RejectResult,
  RestoreResult,
  RunProposal,
  UndoStep,
} from "./run-proposal-types.ts";

export type { RunCopies } from "./run-proposal-copy-texts.ts";
export type { ProposalVcs } from "./run-proposal-git-texts.ts";

/** What the run proposal service needs from the host. */
export interface RunProposalsOptions {
  /**
   * The workspace's version control, or `null` when it has none (history
   * off). Its worktrees go in Halonic's data folder, never in the workspace.
   */
  readonly vcs: ProposalVcs | null;
  /**
   * Where runs with history off get their copy of the workspace
   * (`app.run-proposal-history-off`). Without it, such a run can't start.
   */
  readonly copies?: RunCopies;
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
 * await proposals.settle("01JD8Q"); // when the toast has gone
 */
export class RunProposals {
  private readonly texts: ProposalTexts;
  private readonly records: ProposalRecordStore;
  private readonly clock: Clock;
  private readonly onEndFailed: (runId: string, error: unknown) => void;
  private readonly decisions: ProposalDecisions;
  private readonly inFile: ProposalParts;
  private readonly settling: ProposalSettling;

  constructor(options: RunProposalsOptions) {
    this.texts = new ProposalTextsByHistory(
      options.vcs === null ? null : new GitProposalTexts(options.vcs, options.digest),
      options.copies === undefined
        ? null
        : new CopyProposalTexts(options.copies, options.store, options.digest),
    );
    this.records = new ProposalRecordStore(options.records);
    this.clock = options.clock;
    this.onEndFailed = options.onEndFailed;
    const context = {
      texts: this.texts,
      store: options.store,
      digest: options.digest,
      trash: options.trash,
    };
    this.decisions = new ProposalDecisions(this.records, context);
    this.inFile = new ProposalParts(this.records, context, this.decisions);
    this.settling = new ProposalSettling(this.records, this.texts, options.clock);
  }

  /**
   * Adds the run's worktree at its version (`app.run-proposal-worktree`),
   * or with history off copies the saved files for it
   * (`app.run-proposal-history-off`), and records it, so a folder left by a
   * crash is found at start.
   *
   * @param version - the commit the run's definitions are read from, or
   *   `null` when history is off (`liveVersionOf` says `history-off`)
   * @throws RangeError for a run id that can't name a proposal ref
   * @throws WorkspaceTooBigToCopyError with history off, when the workspace is too big to copy
   * @throws when the run already has a record
   */
  async open(runId: string, version: string | null): Promise<RunWorktree> {
    return await this.records.inTurn(runId, async () => {
      if ((await this.records.read(runId)) !== null) {
        throw new Error(`Run ${runId} already has a worktree or a proposal.`);
      }
      const { folder, record } = await this.texts.open(runId, version);
      await this.records.save(record);
      return { folder };
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
      return record?.state === "running" ? await this.texts.folderOf(record) : null;
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
    const ended = await this.texts.end(record);
    const proposal = ended === null ? null : { ...ended, items: itemsOf(ended.files) };
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
      await this.texts.close(record);
    } catch (error) {
      // The proposal is saved, so the run still reports it.
      this.onEndFailed(runId, error);
    }
    return proposal;
  }

  /** The proposal of a run that ended with changes, settled or not, or `null`. */
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
   * @throws when the run has no proposal; `ProposalUnavailableError` when its ref is gone
   */
  accept(runId: string, target: ProposalTarget): Promise<AcceptResult> {
    return this.decisions.accept(runId, target);
  }

  /**
   * Rejects what the target covers (`app.run-proposal-reject`): each
   * undecided file becomes rejected, or accepted when the person accepted
   * some of its parts (`app.run-proposal-accept-reject-part`); the saved
   * files stay as they are.
   *
   * @returns the decisions record, before and after, as one undo step
   * @throws when the run has no proposal
   */
  reject(runId: string, target: ProposalTarget): Promise<RejectResult> {
    return this.decisions.reject(runId, target);
  }

  /**
   * What is left to decide in an undecided file the run modified: the
   * line parts from the saved file to the run's text less what was
   * rejected, and both texts, for `describeItemChange` on an item page.
   *
   * @returns `null` when the file has no parts to decide: it is decided,
   *   the run added or deleted it, Accept may never write it, or the person
   *   changed it since (Accept lists it under `changedOnDisk`, for Compare)
   * @throws when the run has no proposal, or it doesn't propose the file; `ProposalUnavailableError` when its ref is gone
   */
  parts(runId: string, path: string): Promise<ProposalFileParts | null> {
    return this.inFile.parts(runId, path);
  }

  /**
   * Accepts one part or one change of a file (`app.run-proposal-accept-reject-part`,
   * `app.run-proposal-accept-reject-change`): writes the saved file with it,
   * with `expected` set to what the saved file held, as for a whole file.
   * Once no part is left, the file is accepted.
   *
   * @returns as for {@link accept}, or `stale` when the parts were worked
   *   out from texts that changed since, or `cant-separate`
   * @throws as for {@link parts}
   */
  acceptInFile(runId: string, target: InFileProposalTarget): Promise<InFileResult> {
    return this.inFile.decide(runId, target, "accept");
  }

  /**
   * Rejects one part or one change of a file: takes it out of the run's
   * text and leaves the saved file alone. Once no part is left, the file is
   * accepted if the person accepted any part of it, and rejected if not.
   *
   * @returns as for {@link acceptInFile}; the undo step holds only the decisions record
   * @throws as for {@link parts}
   */
  rejectInFile(runId: string, target: InFileProposalTarget): Promise<InFileResult> {
    return this.inFile.decide(runId, target, "reject");
  }

  /**
   * The texts Compare shows for a file of the proposal: the run's base,
   * the saved file and the run's, less what the person rejected of it.
   *
   * @throws when the run has no proposal, or it doesn't propose the file; `ProposalUnavailableError` when its ref is gone
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
   *
   * @throws when the run has no proposal, or it is settled
   */
  restore(step: UndoStep, to: "before" | "after"): Promise<RestoreResult> {
    return this.decisions.restore(step, to);
  }

  /**
   * Settles the proposal once the person can no longer undo their last
   * decision on it, when the toast has gone (`app.run-proposal-done`):
   * when no file is left undecided, its ref is deleted and its record is
   * kept, as settled, for the Inbox. Then drop the run's undo steps from
   * the history (their source names the run): nothing can be decided any
   * more, so Undo of them would fail. A file that may never be written
   * doesn't keep the proposal open.
   *
   * @returns `settled`, now or before, or `open` when a file is still
   *   undecided (an Undo brought it back): nothing changed
   * @throws when the run has no proposal
   */
  settle(runId: string): Promise<SettleResult> {
    return this.settling.settle(runId);
  }

  /**
   * Whether an open proposal's ref is gone, deleted outside Halonic
   * (`app.run-proposal-unavailable`): its texts can't be shown, and Accept,
   * `parts` and Compare throw `ProposalUnavailableError`. The Inbox then
   * offers only {@link removeUnavailable}. A settled proposal is never
   * unavailable: its ref goes on purpose.
   *
   * @throws when the run has no proposal
   */
  isUnavailable(runId: string): Promise<boolean> {
    return this.settling.isUnavailable(runId);
  }

  /**
   * Removes a proposal whose ref is gone (`app.run-proposal-unavailable`):
   * its record is kept, settled as unavailable, and files still undecided
   * were not reviewed. Then drop the run's undo steps from the history, as
   * for {@link settle}.
   *
   * @throws when the run has no proposal, it is settled, or its ref is still there
   */
  removeUnavailable(runId: string): Promise<void> {
    return this.settling.removeUnavailable(runId);
  }

  /**
   * Settles every open proposal whose run finished 30 days ago or more
   * (`app.run-proposal-done`); its undecided files were not reviewed. Also
   * deletes the ref of a settled proposal a crash left it to. Call it at
   * start and once a day.
   *
   * @returns the runs settled now, whose undo steps to drop
   */
  settleExpired(): Promise<string[]> {
    return this.settling.settleExpired();
  }

  /**
   * Removes what runs left that the engine has ended, from a crash or an
   * `end` that couldn't finish: their worktrees or copies, records and
   * proposal refs, every worktree no open run records, and every copy no
   * record names. The folders of `openRuns` stay for `folderOf`, and so do
   * the copies of proposals. Call it at start, before any run can open a
   * folder.
   *
   * @param openRuns - the runs the engine hasn't ended: those waiting for a
   * person, and those it will end as interrupted
   */
  async removeLeftovers(openRuns: ReadonlySet<string>): Promise<void> {
    const running: RunningRecord[] = [];
    for (const runId of await this.records.running()) {
      const record = await this.records.read(runId);
      if (record?.state !== "running") {
        continue;
      }
      if (openRuns.has(runId)) {
        running.push(record);
        continue;
      }
      await this.texts.discard(record);
      await this.records.remove(runId);
    }
    await this.texts.removeLeftovers({ running, recorded: await this.records.recordedRuns() });
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
