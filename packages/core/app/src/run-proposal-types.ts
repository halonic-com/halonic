// The shapes the run proposal service takes and gives (HAL-3248), apart
// from the service, so the Studio's Inbox can use them without reading it.
// Agreed with Elena on HAL-4121.

import type { ExpectedContent } from "@halonicjs/ports";
import type { LineChange } from "@halonicjs/std";
import type { ItemPath } from "./changes/revert-parts.ts";

/** A proposed file's text at the run's base: its digest, or `"absent"` when the run created it. */
export type FileBase = { readonly digest: Exclude<ExpectedContent, "absent"> } | "absent";

/** One file a run changed in its worktree. */
export interface ProposedFile {
  /** Relative to the workspace root, "/" separated. */
  readonly path: string;
  readonly change: "added" | "modified" | "deleted";
  /** The file at the run's base, which Accept passes as `expected`. */
  readonly base: FileBase;
}

/** What every run proposal holds, with history on or off. */
interface RunProposalFields {
  readonly runId: string;
  /** Sorted by path. */
  readonly files: readonly ProposedFile[];
  /** The ids of the items the files belong to, in path order, each once, for "to Support triage and 2 more". */
  readonly items: readonly string[];
}

/** A proposal of a run in a workspace with history on: its texts are in the commit `ref` points at. */
export interface HistoryOnProposal extends RunProposalFields {
  readonly history: "git";
  /** The commit the run started at: its version, and the parent of the proposal's commit. */
  readonly base: string;
  /** `refs/halonic/proposals/<runId>`. */
  readonly ref: string;
}

/**
 * A proposal of a run in a workspace with history off
 * (`app.run-proposal-history-off`): its texts are in the run's copy in
 * Halonic's data folder, so there is no commit and no ref.
 */
export interface HistoryOffProposal extends RunProposalFields {
  readonly history: "off";
  readonly base: null;
  readonly ref: null;
}

/**
 * What a run that changed files proposes, as `run.proposal` carries it
 * (flow-inbox CHECK C10). The Inbox reads `runId`, `files` and `items`,
 * which both kinds have; narrow on `history` before reading `base` or `ref`.
 */
export type RunProposal = HistoryOnProposal | HistoryOffProposal;

/** Where a proposed file stands. A refused file is `not-applicable`: it is never written. */
export type Decision = "accepted" | "rejected" | "undecided" | "not-applicable";

/**
 * One write the shared undo history can take back. `null` means no file.
 * An undo writes `before` with `expected` set to `after`'s digest, so it
 * never overwrites a change made since.
 */
export interface UndoFileWrite {
  readonly path: string;
  readonly before: string | null;
  readonly after: string | null;
}

/** Which service made an {@link UndoStep}, so the history can find a run's steps and drop them. */
export type UndoSource =
  | { readonly kind: "run-proposal"; readonly runId: string }
  | { readonly kind: "review" }
  | { readonly kind: "edit" };

/**
 * One step of the workspace's undo history: the files it wrote, before and
 * after. For a run proposal, the decisions record is one of the entries,
 * at `.halonic/proposals/<runId>.json`. The step holds texts, not a
 * pointer to the ref, so it still works once the ref is gone.
 */
export interface UndoStep {
  readonly source: UndoSource;
  readonly files: readonly UndoFileWrite[];
}

/** Why a proposed file can't be accepted (`app.run-proposal-trust`). */
export type RefusalReason = "under-git" | "under-halonic" | "outside-workspace";

/** What one accept did, for a part, a change, a file or all of them alike. */
export interface AcceptResult {
  /** `null` when nothing was written. */
  readonly undo: UndoStep | null;
  /** The files written, by path. */
  readonly written: readonly string[];
  /** The files the person changed since the run's base: nothing was written; they wait for Compare. */
  readonly changedOnDisk: readonly string[];
  /** The files that may never be written; they stay in the proposal as `not-applicable`. */
  readonly refused: readonly { readonly path: string; readonly why: RefusalReason }[];
}

/** What one reject did: only the decisions record changes. */
export interface RejectResult {
  readonly undo: UndoStep;
}

/** The three texts Compare shows for a file; `null` means no file. */
export interface CompareTexts {
  readonly base: string | null;
  readonly saved: string | null;
  readonly run: string | null;
}

/** What one Accept or Reject covers: one file, or every undecided file. */
export type ProposalTarget = { readonly file: string } | "all";

/**
 * What is left to decide in a file the run modified, once some of its
 * parts or changes were decided: the saved file and the run's text with
 * the rejected ones taken out. Before any, they are the run's base and the
 * run's text.
 */
export interface ProposalFileParts {
  readonly path: string;
  /** The saved file the parts were worked out from. */
  readonly saved: string;
  /** The run's text, less what the person rejected. */
  readonly run: string;
  /** Names both texts; pass it back with a part or change target. */
  readonly seen: string;
  /** The changes left, as line changes from `saved` to `run`, in order. */
  readonly parts: readonly LineChange[];
}

/** One part or one change inside a file of a proposal (`app.run-proposal-accept-reject-part`, `-change`). */
export type InFileProposalTarget =
  | {
      readonly kind: "part";
      readonly file: string;
      /** Its index in {@link ProposalFileParts.parts}. */
      readonly part: number;
      /** The {@link ProposalFileParts.seen} the parts were worked out from. */
      readonly seen: string;
    }
  | {
      /** A line `describeItemChange` gives from `saved` to `run` (HAL-3278). */
      readonly kind: "change";
      readonly file: string;
      /** The line's `parts`: the item paths it covers. */
      readonly parts: readonly ItemPath[];
      readonly seen: string;
    };

/** What one Accept or Reject of a part or a change did. */
export type InFileResult =
  | ({ readonly status: "done" } & AcceptResult)
  /** The parts were worked out from texts that changed since: nothing changed; show them again. */
  | { readonly status: "stale"; readonly path: string }
  /**
   * The change can't be decided apart from the rest of the file: the run
   * added or deleted it, the line has no parts, or a text doesn't read as
   * YAML. Nothing changed; offer the parts or the whole file instead.
   */
  | { readonly status: "cant-separate"; readonly path: string; readonly message: string };

/**
 * Thrown when a call needs the run's texts and they are gone: its proposal
 * ref, or with history off its copy, was deleted outside Halonic
 * (`app.run-proposal-unavailable`). The Inbox shows the proposal as
 * unavailable and offers `removeUnavailable`.
 */
export class ProposalUnavailableError extends Error {
  readonly runId: string;

  constructor(runId: string) {
    super(`The proposal of run ${runId} is unavailable: its texts are gone.`);
    this.name = "ProposalUnavailableError";
    this.runId = runId;
  }
}

/**
 * Thrown by `open` with history off when the workspace is too big to copy
 * for a run (`app.run-proposal-history-off`). Nothing of the copy is left.
 */
export class WorkspaceTooBigToCopyError extends Error {
  readonly runId: string;

  constructor(runId: string, limit: string) {
    super(
      `Run ${runId} can't start: the workspace is too big to run with history off (more than ${limit}).`,
    );
    this.name = "WorkspaceTooBigToCopyError";
    this.runId = runId;
  }
}

/** What an Undo or Redo of a proposal's step did. */
export interface RestoreResult {
  /** Entries left alone because they changed since the step, by path. */
  readonly changedOnDisk: readonly string[];
  /** Entries that may never be written, as for Accept; nothing of them was written. */
  readonly refused: readonly { readonly path: string; readonly why: RefusalReason }[];
}
