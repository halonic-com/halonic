// The shapes the review service takes and gives (HAL-3277), apart from the
// service, so the Studio can use them without reading the service.

import type { ExpectedContent } from "@halonicjs/ports";
import type { LineChange } from "@halonicjs/std";
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

/** What an Accept or Reject covers. Single changes on an item page come with `revertParts` (HAL-3278). */
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
  /** The parts a part target named were worked out from text the file no longer holds: nothing changed; show them again. */
  | { readonly status: "stale"; readonly path: string };

/** The changes to review in one file, for the editor, the item bar and the chat card. */
export interface FileReview {
  readonly path: string;
  readonly card: ReviewCard;
  /** The file with every open assistant change rejected; `null` for a file the assistant created. */
  readonly baseline: string | null;
  /** The digest of the text the parts were worked out from. Pass it back with a part target. */
  readonly seen: ExpectedContent;
  /** The changes to review, as line changes from the baseline to that text, in order. */
  readonly parts: readonly LineChange[];
}

/** A file with changes to review, and the card it belongs to. */
export interface ItemToReview {
  readonly path: string;
  readonly card: ReviewCard;
}

/** What `ReviewService.check` found. */
export interface ReviewCheck {
  /** Files changed outside Halonic since they were last seen. They keep their changes to review and wait for Compare. */
  readonly held: readonly string[];
  /** Records that couldn't be read and were removed: those files' changes are ordinary changes now. */
  readonly dropped: readonly DroppedReviewRecord[];
}
