import type { ChangeMarkBusy } from "./change-mark.tsx";
import type { ItemChangeToReview, ItemReview, ItemReviewTarget } from "./item-review-api.ts";

/**
 * How many changes a decision covers, for its toast: a change takes along those it needs.
 *
 * @example
 * decidedCount({ kind: "all", path }, "accept", review); // review.changes.length
 */
export function decidedCount(
  target: ItemReviewTarget,
  verb: ChangeMarkBusy,
  review: ItemReview | null,
): number {
  if (target.kind === "all") return review?.changes.length ?? 0;
  if (target.review.whole) return 1;
  return changesDecided(target.review, target.change, verb).length;
}

/**
 * The changes one decision covers: Accept keeps the changes the change needs, and Reject undoes
 * the changes that need it, each in turn, so the item never points at a step that isn't there.
 * The app's review service decides the same ones.
 *
 * @example
 * changesDecided(review, arrowToNewStep, "accept"); // [arrowToNewStep, newStep]
 */
export function changesDecided(
  review: ItemReview,
  change: ItemChangeToReview,
  verb: ChangeMarkBusy,
): ItemChangeToReview[] {
  const takesAlong = (decided: ItemChangeToReview, other: ItemChangeToReview): boolean =>
    verb === "accept"
      ? (decided.needs ?? []).includes(other.id)
      : (other.needs ?? []).includes(decided.id);
  const decided = [change];
  // The loop also visits the changes it adds, so the ones they take along come too.
  for (const next of decided) {
    for (const other of review.changes) {
      if (!decided.includes(other) && takesAlong(next, other)) decided.push(other);
    }
  }
  return decided;
}
