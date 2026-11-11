// Picks where a run's texts are from the run itself (HAL-3248): a new run
// from its version (`null` when history is off), and a run or proposal
// that already exists from its own `history`, never from today's setting.
// A person who turns history on or off between a run and Accept still gets
// the run's texts. Internal to `core/app`.

import type { CopyProposalTexts } from "./run-proposal-copy-texts.ts";
import type { GitProposalTexts } from "./run-proposal-git-texts.ts";
import type {
  HistoryOffRunningRecord,
  HistoryOnRunningRecord,
  RunningRecord,
} from "./run-proposal-record.ts";
import type {
  OpenedRun,
  ProposalReader,
  ProposalTexts,
  RecordedRuns,
  WithoutItems,
} from "./run-proposal-texts.ts";
import { ProposalUnavailableError, type RunProposal } from "./run-proposal-types.ts";

/**
 * The texts of a workspace's runs, with history on, off, or both over time.
 * A kind the host doesn't give is one whose texts are gone: its proposals
 * are unavailable, and its runs have no folder.
 */
export class ProposalTextsByHistory implements ProposalTexts {
  private readonly git: GitProposalTexts | null;
  private readonly copy: CopyProposalTexts | null;

  constructor(git: GitProposalTexts | null, copy: CopyProposalTexts | null) {
    this.git = git;
    this.copy = copy;
  }

  async open(runId: string, version: string | null): Promise<OpenedRun> {
    if (version === null) {
      return await this.copyTexts().open(runId);
    }
    if (this.git === null) {
      throw new Error(`Run ${runId} starts at a commit, but the workspace has no version control.`);
    }
    return await this.git.open(runId, version);
  }

  async folderOf(record: RunningRecord): Promise<string | null> {
    if (record.history === "git") {
      return (await this.git?.folderOf(record)) ?? null;
    }
    return (await this.copy?.folderOf(record)) ?? null;
  }

  async end(record: RunningRecord): Promise<WithoutItems<RunProposal> | null> {
    if (record.history === "git") {
      return await this.gitTexts().end(record);
    }
    return await this.copyTexts().end(record);
  }

  async close(record: RunningRecord): Promise<void> {
    if (record.history === "git") {
      await this.git?.close(record);
    } else {
      await this.copy?.close();
    }
  }

  async readerOf(proposal: RunProposal): Promise<ProposalReader> {
    if (proposal.history === "git") {
      if (this.git === null) {
        throw new ProposalUnavailableError(proposal.runId);
      }
      return await this.git.readerOf(proposal);
    }
    if (this.copy === null) {
      throw new ProposalUnavailableError(proposal.runId);
    }
    return await this.copy.readerOf(proposal);
  }

  async isAvailable(proposal: RunProposal): Promise<boolean> {
    if (proposal.history === "git") {
      return (await this.git?.isAvailable(proposal)) ?? false;
    }
    return (await this.copy?.isAvailable(proposal)) ?? false;
  }

  async release(proposal: RunProposal): Promise<void> {
    if (proposal.history === "git") {
      await this.git?.release(proposal);
    } else {
      await this.copy?.release(proposal);
    }
  }

  async discard(record: RunningRecord): Promise<void> {
    if (record.history === "git") {
      await this.git?.discard(record);
    } else {
      await this.copy?.discard(record);
    }
  }

  async removeLeftovers({ running, recorded }: RecordedRuns<RunningRecord>): Promise<void> {
    await this.git?.removeLeftovers({
      running: running.filter(
        (record): record is HistoryOnRunningRecord => record.history === "git",
      ),
      recorded,
    });
    await this.copy?.removeLeftovers({
      running: running.filter(
        (record): record is HistoryOffRunningRecord => record.history === "off",
      ),
      recorded,
    });
  }

  private gitTexts(): GitProposalTexts {
    if (this.git === null) {
      throw new Error("The workspace has no version control, so a run with history on can't end.");
    }
    return this.git;
  }

  private copyTexts(): CopyProposalTexts {
    if (this.copy === null) {
      throw new Error("History is off, but the host gave no folder for run copies.");
    }
    return this.copy;
  }
}
