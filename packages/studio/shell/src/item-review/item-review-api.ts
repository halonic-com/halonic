// The assistant's changes to review in one item's file, as an item page's bar and marks read and
// decide them (AI changes 1.2, T14 PR 14). Each feature with an item page names its own service
// key for an `ItemReviewHost` of its refs; the app provides it over its review service.

import type { ExpectedContent } from "@halonicjs/ports";

/** One change the assistant made to an item: one field, or one part such as a step. */
export interface ItemChangeToReview {
  /** Stable within one reading, such as `field:model` or `step:notify`. */
  readonly id: string;
  /** What changed, such as "Model: small → large". */
  readonly sentence: string;
  /** Listed as Important: what the item is told, may use and reach, and its sandbox. */
  readonly important: boolean;
  /**
   * The places in the file the change covers, such as `["model"]` or `["states", "notify"]`, so
   * the page puts its mark there. Empty for a change that covers the whole file.
   */
  readonly parts: readonly (readonly string[])[];
  /**
   * The value at the first part before the assistant changed it, for the mark's old value; absent
   * when the part wasn't in the file then.
   */
  readonly before?: { readonly value: unknown } | undefined;
  /**
   * The ids of the changes this one can't be kept without, such as the step a changed arrow now
   * goes to. Accepting this change accepts them too, and rejecting one of them rejects this change
   * too, so a decision never leaves the item pointing at something that isn't there.
   */
  readonly needs?: readonly string[] | undefined;
}

/** The assistant's changes to review in one item's file, as last read. */
export interface ItemReview {
  /** The item's file, from the workspace folder. */
  readonly path: string;
  /**
   * The changes can only be accepted or rejected together, as one: the assistant created the file
   * (Reject then deletes it), deleted it, changed only its comments or spacing, or it can't be
   * read as the item before or after. `changes` then holds one change, "New", "Deleted" or
   * "Changed", with no parts.
   */
  readonly whole: boolean;
  /** In the order the item's describer lists them. */
  readonly changes: readonly ItemChangeToReview[];
  /**
   * Names the texts the changes were worked out from. A decision on a change passes it back, so a
   * click on a review that is out of date decides nothing and answers `stale`.
   */
  readonly seen: ExpectedContent;
}

/**
 * What one Accept or Reject did.
 *
 * - `done`: decided; `undo` puts it back as it was (`held` when the file changed since).
 * - `held`: the file changed outside Halonic since Halonic last saw it, so nothing was decided; it
 *   waits for **Compare** (review panel note 4).
 * - `stale`: the review was read before the file changed; nothing was decided. Read it again
 *   quietly and show the new one (note 1).
 * - `cant-separate`: this change can't be decided apart from the rest of the file; offer the file.
 */
export type ItemReviewDecision =
  | { readonly status: "done"; readonly undo: () => Promise<"done" | "held"> }
  | { readonly status: "held" }
  | { readonly status: "stale" }
  | { readonly status: "cant-separate" };

/** What a decision covers: one change of a review, or every change in the file. */
export type ItemReviewTarget =
  | { readonly kind: "change"; readonly review: ItemReview; readonly change: ItemChangeToReview }
  | { readonly kind: "all"; readonly path: string };

/** The assistant's changes to review in the workspace's items of one kind, named by `Ref`. */
export interface ItemReviewHost<Ref> {
  /** The changes to review in the item's saved file, or `null` when it has none. */
  changesIn(ref: Ref): Promise<ItemReview | null>;
  /** Accepts what the target covers: the file stays as it is, and the change is no longer to review. */
  accept(target: ItemReviewTarget): Promise<ItemReviewDecision>;
  /** Rejects what the target covers: the file gets the values from before the assistant's change back. */
  reject(target: ItemReviewTarget): Promise<ItemReviewDecision>;
  /**
   * Calls `listener` each time the item's changes to review may have changed: a write by the
   * assistant, an Accept, a Reject or an Undo. Returns the way to stop.
   */
  subscribe(ref: Ref, listener: () => void): () => void;
}
