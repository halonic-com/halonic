// A run's texts with history off (HAL-3248, `app.run-proposal-history-off`):
// there is no git, so the run gets a plain copy of the workspace in
// Halonic's data folder. The copy has two sides: `base`, left as the
// workspace was at the start, and `run`, where the run writes. Compare and
// per part need the base text, which a list of digests alone would lose
// once the person changes the saved file. At the end both sides are trimmed
// to the files the run changed, and they are what the proposal keeps, in
// place of the ref. Internal to `core/app`.

import type { DefinitionSource, DefinitionStore, Digest } from "@halonicjs/ports";
import { contentDigest, encodeUtf8 } from "@halonicjs/std";
import { refusalOf } from "./run-proposal-decide.ts";
import type { HistoryOffRunningRecord } from "./run-proposal-record.ts";
import type {
  KeptTexts,
  ProposalReader,
  RecordedRuns,
  WithoutItems,
} from "./run-proposal-texts.ts";
import {
  type HistoryOffProposal,
  ProposalUnavailableError,
  type ProposedFile,
  WorkspaceTooBigToCopyError,
} from "./run-proposal-types.ts";

/**
 * Where the host keeps the runs' copies: in Halonic's data folder, rooted
 * in the workspace's folder in the profile like the records, never in the
 * workspace.
 */
export interface RunCopies {
  /** Makes the run's copy, with both sides empty. */
  create(runId: string): Promise<void>;
  /** One side of the run's copy, as a store of its own. */
  store(runId: string, side: "base" | "run"): DefinitionStore;
  /** The absolute folder of the run's `run` side: the only folder the run writes workspace files in. */
  folderOf(runId: string): string;
  /** Removes the run's copy, both sides; nothing when it is gone. */
  remove(runId: string): Promise<void>;
  /** The runs that have a copy. */
  list(): Promise<string[]>;
}

const MEGABYTE = 1024 * 1024;

/** How big a workspace may be to run with history off. */
export interface CopyLimits {
  readonly files: number;
  readonly bytes: number;
}

/**
 * Workspaces with history off are small: that is why a copy is enough.
 * Past these, a copy per run would fill the disk unnoticed, so the run
 * doesn't start.
 */
export const copyLimits: CopyLimits = { files: 10_000, bytes: 100 * MEGABYTE };

/** The texts of runs in copies of the workspace. */
export class CopyProposalTexts implements KeptTexts<HistoryOffRunningRecord, HistoryOffProposal> {
  private readonly copies: RunCopies;
  private readonly workspace: DefinitionSource;
  private readonly digest: Digest;
  private readonly limits: CopyLimits;

  /**
   * @param workspace - the saved files, which the copy is made of
   * @param limits - a test passes small ones
   */
  constructor(
    copies: RunCopies,
    workspace: DefinitionSource,
    digest: Digest,
    limits: CopyLimits = copyLimits,
  ) {
    this.copies = copies;
    this.workspace = workspace;
    this.digest = digest;
    this.limits = limits;
  }

  /**
   * Copies the saved files to both sides of the run's copy. The copy leaves
   * out what Accept may never write (`.git/`, `.halonic/`) and what the
   * workspace store won't serve (private paths, links).
   *
   * @throws WorkspaceTooBigToCopyError past the limits; nothing of the copy is left
   */
  async open(runId: string): Promise<{ folder: string; record: HistoryOffRunningRecord }> {
    await this.copies.create(runId);
    try {
      await this.copyWorkspace(runId);
    } catch (error) {
      await this.copies.remove(runId);
      throw error;
    }
    return {
      folder: this.copies.folderOf(runId),
      record: { state: "running", history: "off", runId },
    };
  }

  private async copyWorkspace(runId: string): Promise<void> {
    const base = this.copies.store(runId, "base");
    const run = this.copies.store(runId, "run");
    let files = 0;
    let bytes = 0;
    for (const path of await this.workspace.list()) {
      const text = refusalOf(path) === null ? await this.workspace.read(path) : null;
      if (text === null) {
        // Accept may never write it, or it went since the list.
        continue;
      }
      files += 1;
      bytes += encodeUtf8(text).length;
      if (files > this.limits.files) {
        throw new WorkspaceTooBigToCopyError(runId, `${countOf(this.limits.files)} files`);
      }
      if (bytes > this.limits.bytes) {
        throw new WorkspaceTooBigToCopyError(runId, sizeOf(this.limits.bytes));
      }
      await base.write(path, text);
      await run.write(path, text);
    }
  }

  async folderOf(record: HistoryOffRunningRecord): Promise<string | null> {
    const runIds = await this.copies.list();
    return runIds.includes(record.runId) ? this.copies.folderOf(record.runId) : null;
  }

  /**
   * Compares the two sides and trims both to the files the run added,
   * deleted or modified. When it changed nothing, the copy goes.
   */
  async end(record: HistoryOffRunningRecord): Promise<WithoutItems<HistoryOffProposal> | null> {
    const { runId } = record;
    const base = this.copies.store(runId, "base");
    const run = this.copies.store(runId, "run");
    const paths = [...new Set([...(await base.list()), ...(await run.list())])].sort();
    const files: ProposedFile[] = [];
    for (const path of paths) {
      const file = await this.proposedFile(path, base, run);
      if (file === null) {
        await base.remove(path);
        await run.remove(path);
      } else {
        files.push(file);
      }
    }
    if (files.length === 0) {
      await this.copies.remove(runId);
      return null;
    }
    return { runId, history: "off", base: null, ref: null, files };
  }

  /** Nothing to do: `end` trimmed the copy to the proposal, or removed it. */
  async close(): Promise<void> {}

  async readerOf(proposal: HistoryOffProposal): Promise<ProposalReader> {
    if (!(await this.isAvailable(proposal))) {
      throw new ProposalUnavailableError(proposal.runId);
    }
    return {
      read: (side, path) => this.copies.store(proposal.runId, side).read(path),
    };
  }

  async isAvailable(proposal: HistoryOffProposal): Promise<boolean> {
    return (await this.copies.list()).includes(proposal.runId);
  }

  async release(proposal: HistoryOffProposal): Promise<void> {
    await this.copies.remove(proposal.runId);
  }

  async discard(record: HistoryOffRunningRecord): Promise<void> {
    await this.copies.remove(record.runId);
  }

  /**
   * Removes every copy no record names. The copy of a proposal stays,
   * settled or not, and so does one whose record can't be read: it may
   * hold a proposal's texts.
   */
  async removeLeftovers({ recorded }: RecordedRuns<HistoryOffRunningRecord>): Promise<void> {
    for (const runId of await this.copies.list()) {
      if (!recorded.has(runId)) {
        await this.copies.remove(runId);
      }
    }
  }

  /** How a file differs between the two sides; `null` when it doesn't. */
  private async proposedFile(
    path: string,
    base: DefinitionSource,
    run: DefinitionSource,
  ): Promise<ProposedFile | null> {
    const before = await base.read(path);
    const after = await run.read(path);
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

/** A count as people read it: `10,000`. */
function countOf(count: number): string {
  return count.toLocaleString("en");
}

/** A size limit in whole megabytes: `100 MB`. Limits are whole megabytes. */
function sizeOf(bytes: number): string {
  return `${countOf(Math.floor(bytes / MEGABYTE))} MB`;
}
