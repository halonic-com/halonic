import type { FileReview, ReviewCard } from "@halonicjs/app";
import { notesToTheModel } from "./card-words.ts";

/** One decision on some of a card's changes, wherever it was made: on the card, the item or Changes. */
export interface CardStep {
  readonly decision: "accept" | "reject";
  readonly count: number;
}

/** How a card with nothing left to review ended (flow-assistant 3.3). */
export type CardEnd =
  | { readonly kind: "accepted" }
  /** Some changes were accepted and the rest rejected: "Accepted 2 of 3". */
  | { readonly kind: "partly"; readonly accepted: number; readonly total: number }
  | { readonly kind: "rejected" }
  /** A newer card has the file's changes to review: one of this chat, or of another one. */
  | { readonly kind: "replaced"; readonly by: ReviewCard; readonly sameChat: boolean }
  /** The person chose **Use the other one** in Compare, so the version from outside replaced the file. */
  | { readonly kind: "replaced-outside" };

/**
 * The step that took a file's changes to review from `before` to `after`. Each step decides its
 * changes one way, as every Accept and Reject does. An Accept keeps the changes, so they join the
 * baseline; a Reject puts the baseline back in the file, so the baseline stays.
 */
export function stepBetween(before: FileReview, after: FileReview, count: number): CardStep {
  return { decision: after.baseline === before.baseline ? "reject" : "accept", count };
}

/**
 * The step that decided the last of the changes in `before`: with no changes left the file is
 * either back at the baseline (a Reject) or keeps them (an Accept). `saved` is the file now, `null`
 * for none, so a rejected new file and an accepted delete both read right.
 */
export function lastStep(before: FileReview, saved: string | null, count: number): CardStep {
  return { decision: saved === before.baseline ? "reject" : "accept", count };
}

/** What the card's steps add up to. */
export function endOfSteps(steps: readonly CardStep[]): CardEnd {
  const count = (decision: CardStep["decision"]) =>
    steps.filter((step) => step.decision === decision).reduce((sum, step) => sum + step.count, 0);
  const accepted = count("accept");
  const rejected = count("reject");
  if (rejected === 0) return { kind: "accepted" };
  if (accepted === 0) return { kind: "rejected" };
  return { kind: "partly", accepted, total: accepted + rejected };
}

/**
 * Takes back the newest steps until they cover no more than `decided` changes: an Undo, from the
 * toast, Ctrl+Z or Changes, put some of them back to review.
 */
export function stepsUpTo(steps: readonly CardStep[], decided: number): CardStep[] {
  const kept = [...steps];
  let covered = kept.reduce((sum, step) => sum + step.count, 0);
  while (covered > decided) {
    const newest = kept.pop();
    if (newest === undefined) break;
    covered -= newest.count;
  }
  return kept;
}

/** What the model is told about the end with the person's next message; nothing when it made the newer change itself. */
export function noteOf(end: CardEnd, path: string): string | undefined {
  switch (end.kind) {
    case "accepted":
      return notesToTheModel.accepted(path);
    case "partly":
      return notesToTheModel.partly(end.accepted, end.total, path);
    case "rejected":
      return notesToTheModel.rejected(path);
    case "replaced":
      return end.sameChat ? undefined : notesToTheModel.anotherChat(path);
    case "replaced-outside":
      return notesToTheModel.outside(path);
  }
}
