// The shapes the run proposal service takes and gives (HAL-3248), apart
// from the service, so the Studio's Inbox can use them without reading it.
// Agreed with Elena on HAL-4121.

import type { ExpectedContent } from "@halonicjs/ports";

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

/**
 * What a run that changed files proposes, as `run.proposal` carries it
 * (flow-inbox CHECK C10). The run's texts are in the commit `ref` points at.
 */
export interface RunProposal {
  readonly runId: string;
  /** The commit the run started at: its version, and the parent of the proposal's commit. */
  readonly base: string;
  /** `refs/halonic/proposals/<runId>`. */
  readonly ref: string;
  /** Sorted by path. */
  readonly files: readonly ProposedFile[];
  /** The ids of the items the files belong to, in path order, each once, for "to Support triage and 2 more". */
  readonly items: readonly string[];
}

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

/**
 * What one Accept or Reject covers: one file, or every undecided file.
 * Parts and changes inside a file follow (`revertParts`, HAL-3278).
 */
export type ProposalTarget = { readonly file: string } | "all";

/** What an Undo or Redo of a proposal's step did. */
export interface RestoreResult {
  /** Entries left alone because they changed since the step, by path. */
  readonly changedOnDisk: readonly string[];
  /** Entries that may never be written, as for Accept; nothing of them was written. */
  readonly refused: readonly { readonly path: string; readonly why: RefusalReason }[];
}
