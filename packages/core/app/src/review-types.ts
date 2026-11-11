// The shapes the review service takes and gives (HAL-3277), apart from the
// service, so the Studio can use them without reading the service.

import type { CantTryStep, LeftOutReason } from "@halonicjs/events";
import type { DefinitionSource, ExpectedContent } from "@halonicjs/ports";
import type { LineChange } from "@halonicjs/std";
import type { ItemPath } from "./changes/revert-parts.ts";
import type { ProposalRefusal } from "./review-gate.ts";
import type { ReviewCard, ReviewRecord } from "./review-record.ts";
import type { DroppedReviewRecord } from "./review-records.ts";

/** What the assistant's `propose_file` asks to write. */
export interface ProposedWrite {
  readonly path: string;
  readonly content: string;
  /** The digest of the file as the model last read it in this chat, or `"absent"` for a new file. */
  readonly expected: ExpectedContent;
  /** The chat card the write belongs to. */
  readonly card: ReviewCard;
}

/** What the assistant's `propose_delete` asks to delete. */
export interface ProposedDelete {
  readonly path: string;
  /** The digest of the file as the model last read it in this chat. */
  readonly expected: ExpectedContent;
  /** The chat card the delete belongs to. */
  readonly card: ReviewCard;
}

/**
 * Halonic's own trash, in the app data folder, not the system's (Elena's,
 * T5). The assistant's deletes go there, so Reject can put a file back
 * as it was.
 */
export interface Trash {
  /** Moves the file into the trash, if it still holds `expected`. */
  moveToTrash(
    path: string,
    expected?: ExpectedContent,
  ): Promise<
    | { readonly status: "done"; readonly trashId: string }
    | { readonly status: "changed-on-disk"; readonly current: string | null }
  >;
  /**
   * Puts a file back where it was. `occupied`: something is at that path
   * now, and nothing was overwritten. `missing`: the trash no longer has
   * that entry, such as after it was put back once already.
   */
  restore(
    trashId: string,
  ): Promise<
    | { readonly status: "done" }
    | { readonly status: "occupied"; readonly current: string }
    | { readonly status: "missing" }
  >;
}

/** One file in a {@link ReviewStep}. `null` means no record, or no file. */
export interface ReviewedFile {
  readonly path: string;
  readonly record: { readonly before: ReviewRecord | null; readonly after: ReviewRecord | null };
  /** The file's text before and after; left out when the step didn't write the file, as Accept doesn't. */
  readonly file?: { readonly before: string | null; readonly after: string | null };
}

/**
 * What one write, Accept or Reject did, so the shared undo history can take
 * it back as one step with `ReviewService.restore`. An Accept changes
 * only records, so without this an undo after Accept would do nothing.
 */
export interface ReviewStep {
  readonly files: readonly ReviewedFile[];
}

/** What `ReviewService.propose` did. */
export type ProposeOutcome =
  | {
      readonly status: "written";
      readonly step: ReviewStep;
      /** The card that had the file before, when it was another one: it shows as replaced. */
      readonly replaced: ReviewCard | null;
    }
  /** The file isn't what the model read: nothing was written, and the model reads it again. */
  | { readonly status: "changed-on-disk"; readonly current: string | null }
  /** The file changed outside Halonic since it was last seen; it waits for Compare (AI changes 1.10). */
  | { readonly status: "held" }
  /**
   * The assistant may not write this file (`app.assistant-no-git-or-halonic`,
   * `app.assistant-untrusted-items-only`). Nothing was read or written.
   */
  | { readonly status: "refused"; readonly reason: ProposalRefusal };

/** What an Accept or Reject covers. */
export type ReviewTarget =
  | {
      /** One part: a line change of {@link FileReview.parts}. */
      readonly kind: "part";
      readonly path: string;
      /** Its index in `parts`. */
      readonly part: number;
      /**
       * The {@link FileReview.seen} the parts were worked out from, so a
       * click on an out-of-date list does nothing. Parts from unsaved text
       * are for showing only, so they always answer `stale`: save first.
       */
      readonly seen: ExpectedContent;
    }
  | {
      /**
       * One change on an item page: a line `describeItemChange` gives for
       * the baseline before and the file after (HAL-3278).
       */
      readonly kind: "change";
      readonly path: string;
      /** The line's `parts`: the item paths it covers. */
      readonly parts: readonly ItemPath[];
      /** The {@link FileReview.seen} the line was worked out from, as for a part. */
      readonly seen: ExpectedContent;
    }
  | { readonly kind: "file"; readonly path: string }
  | { readonly kind: "card"; readonly card: ReviewCard }
  | { readonly kind: "chat"; readonly chatId: string };

/** What an Accept, Reject or restore did. */
export type ReviewOutcome =
  | {
      readonly status: "done";
      /** What changed, as one undo step. Empty when nothing did. */
      readonly step: ReviewStep;
      /**
       * Files left alone because they changed outside Halonic since they
       * were last seen. They wait for Compare (AI changes 1.10).
       */
      readonly held: readonly string[];
    }
  /** The parts a part or change target named were worked out from text the file no longer holds: nothing changed; show them again. */
  | { readonly status: "stale"; readonly path: string }
  /**
   * A change target that can't be decided apart from the rest of the
   * file: the assistant created the file, the line has no parts, or the
   * file or its baseline doesn't read as YAML. Nothing changed; offer the
   * line parts or the whole file instead. `message` says which, for the log.
   */
  | { readonly status: "cant-separate"; readonly path: string; readonly message: string };

/** The changes to review in one file, for the editor, the item bar and the chat card. */
export interface FileReview {
  readonly path: string;
  readonly card: ReviewCard;
  /** The file with every open assistant change rejected; `null` for a file the assistant created. */
  readonly baseline: string | null;
  /**
   * The digest of the baseline and the text the parts were worked out
   * from. Pass it back with a part or change target.
   */
  readonly seen: ExpectedContent;
  /** The assistant deleted the file: it is accepted or rejected as a whole, so it has no parts. */
  readonly deleted: boolean;
  /** The changes to review, as line changes from the baseline to that text, in order. */
  readonly parts: readonly LineChange[];
}

/** A file with changes to review, and the card it belongs to. */
export interface ItemToReview {
  readonly path: string;
  readonly card: ReviewCard;
}

/** One file whose changes Try it doesn't use, or uses only some of. */
export interface LeftOutFile {
  readonly path: string;
  /**
   * Why, as the run events name it. `before-trust` wins; otherwise the
   * first of `permissions`, `trust-and-sandbox`, `connections` and
   * `models` that a held-back part of the change is about.
   */
  readonly reason: LeftOutReason;
  /**
   * How many line changes Try it leaves out: those from the text it reads
   * to the file, so the number matches what the person finds in Changes.
   */
  readonly changes: number;
}

/** What the Try it source leaves out, for "Leaves out 3 changes the assistant made before you trusted Acme". */
export interface LeftOut {
  /** The sum of `files[].changes`; 0 when nothing is left out. */
  readonly total: number;
  /** The sum of `changes` over the `before-trust` files. */
  readonly beforeTrust: number;
  /** In path order. */
  readonly files: readonly LeftOutFile[];
}

/** What Try it and Test read, built in memory from the workspace and the records. */
export interface TryItSource {
  /** The whole workspace, with the left-out changes' baseline values instead. */
  readonly source: DefinitionSource;
  /** For one item's run, only the files that run reads. */
  readonly leftOut: LeftOut;
  /**
   * For one item's run, the steps it can't try because a change is left
   * out: pass them as the run start's `cantTry`, so they never run and the
   * run ends as `cant-try`. Empty without an item.
   */
  readonly cantTry: readonly CantTryStep[];
}

/** What `ReviewService.check` found. */
export interface ReviewCheck {
  /** Files changed outside Halonic since they were last seen. They keep their changes to review and wait for Compare. */
  readonly held: readonly string[];
  /** Records that couldn't be read and were removed: those files' changes are ordinary changes now. */
  readonly dropped: readonly DroppedReviewRecord[];
}
