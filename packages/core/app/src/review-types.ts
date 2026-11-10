// The shapes the review service takes and gives (HAL-3277), apart from the
// service, so the Studio can use them without reading the service.

import type { ExpectedContent } from "@halonicjs/ports";
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
  | { readonly status: "held" };

/** Which files an Accept or Reject covers. Parts and single changes come with the line diff (HAL-3278). */
export type ReviewTarget =
  | { readonly kind: "file"; readonly path: string }
  | { readonly kind: "card"; readonly card: ReviewCard }
  | { readonly kind: "chat"; readonly chatId: string };

/** What an Accept, Reject or restore did. */
export interface ReviewOutcome {
  /** What changed, as one undo step. Empty when nothing did. */
  readonly step: ReviewStep;
  /**
   * Files left alone because they changed outside Halonic since they were
   * last seen. They wait for Compare (AI changes 1.10).
   */
  readonly held: readonly string[];
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
