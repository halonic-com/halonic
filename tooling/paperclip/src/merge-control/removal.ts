import { removalFacts, wakeAuthor } from "./author-wake.ts";
import { dequeueCost } from "./capacity.ts";
import { minutesSince, type PassContext } from "./context.ts";
import type { GateRow } from "./gate.ts";
import type { RemovalReason } from "./state.ts";
import { texts } from "./texts.ts";

/**
 * The no-churn rule (MERGER.md §4 "Removing queued PRs"): a queued pull
 * request never comes out on a gate check, only for a board hold, a branch
 * outside the repository, a conflict with main (a), 15 minutes unmergeable
 * in the queue (b), a new change request (c), a head moved after approval
 * (d), or no signed approval on its head (board checker, 22 Nov; not when
 * the recorded verdicts couldn't be read, HAL-19992). The
 * culprit of a failed group (e) is taken out by GitHub; `culprit.ts` holds it.
 */

/** Unmergeable in the queue this long, seen on two passes, before removal (board, 20 Nov 20:12). */
export const unmergeableMinutes = 15;

function reasonOf(context: PassContext, row: GateRow): RemovalReason | undefined {
  const { number } = row.pull;
  if (context.state.board.hold[String(number)] !== undefined) {
    return "board-hold";
  }
  if (row.foreign) {
    return "foreign";
  }
  if (row.reReview) {
    return "head-moved";
  }
  if (row.changeRequest !== null) {
    return "change-request";
  }
  // A failed read of the recorded verdicts says nothing about the approval,
  // so it stays queued, as on a refused GitHub read (Julian, HAL-19992).
  if (row.noApproval && !row.verdictsUnread) {
    return "no-signed-approval";
  }
  if (row.pull.mergeable === "CONFLICTING") {
    return "conflict";
  }
  const since = context.state.unmergeableSince[String(number)];
  return since !== undefined && minutesSince(context, since) >= unmergeableMinutes
    ? "unmergeable"
    : undefined;
}

function commentOf(context: PassContext, row: GateRow, reason: RemovalReason): string {
  const key = String(row.pull.number);
  switch (reason) {
    case "foreign":
      return texts.removedForeign;
    case "board-hold":
      return texts.removedHold(context.state.board.hold[key] ?? "");
    case "head-moved":
      return texts.removedReReview(
        row.reasons.find((each) => each.startsWith("waiting for re-review")) ?? "",
      );
    case "change-request":
      return texts.removedGate(
        row.pull.head,
        row.reasons.filter((each) => each.startsWith("changes requested")),
      );
    case "no-signed-approval":
      return texts.removedGate(row.pull.head, row.reasons.slice(0, 1));
    case "conflict":
      return texts.removedGate(row.pull.head, [texts.conflict]);
    case "unmergeable":
      return texts.removedGate(row.pull.head, [
        texts.unmergeableSince(context.state.unmergeableSince[key] ?? ""),
      ]);
  }
}

/** The first gate reason the comment names, for the author's wake (the live Merger's `reasons[0]`). */
function whyOf(
  context: PassContext,
  row: GateRow,
  reason: Exclude<RemovalReason, "foreign">,
): string {
  const key = String(row.pull.number);
  switch (reason) {
    case "board-hold":
      return `held out by the board: ${context.state.board.hold[key] ?? ""}`;
    case "head-moved":
      return row.reasons.find((each) => each.startsWith("waiting for re-review")) ?? "";
    case "change-request":
      return row.reasons.find((each) => each.startsWith("changes requested")) ?? "";
    case "no-signed-approval":
      return row.reasons[0] ?? "";
    case "conflict":
      return texts.conflict;
    case "unmergeable":
      return texts.unmergeableSince(context.state.unmergeableSince[key] ?? "");
  }
}

/** Tracks how long queued entries are unmergeable, and returns the ones that come out. */
export function removals(context: PassContext, rows: readonly GateRow[]): GateRow[] {
  const queued = rows.filter((row) => row.entry !== undefined);
  const since = context.state.unmergeableSince;
  for (const row of queued) {
    const key = String(row.pull.number);
    if (row.entry?.state === "UNMERGEABLE") {
      since[key] ??= context.now.toISOString();
    } else {
      delete since[key];
    }
  }
  for (const key of Object.keys(since)) {
    if (!queued.some((row) => String(row.pull.number) === key)) {
      delete since[key];
    }
  }
  const removed: GateRow[] = [];
  // Front of the queue first, so a group several removals cancel counts on the first.
  const byPosition = [...queued].sort(
    (a, b) => (a.entry?.position ?? 0) - (b.entry?.position ?? 0),
  );
  for (const row of byPosition) {
    const reason = reasonOf(context, row);
    if (reason === undefined) {
      continue;
    }
    const key = String(row.pull.number);
    const position = row.entry?.position ?? 0;
    context.actions.push({
      kind: "dequeue",
      number: row.pull.number,
      pullId: row.pull.id,
      head: row.pull.head,
      reason,
      comment: commentOf(context, row, reason),
      cost: dequeueCost(context, position),
    });
    // A branch from a fork can be named like ours, so a foreign pull request wakes nobody.
    if (reason !== "foreign") {
      wakeAuthor(
        context,
        row.pull,
        "removed",
        removalFacts(row.pull, reason, whyOf(context, row, reason)),
      );
    }
    if (reason === "unmergeable") {
      context.state.cooldown[key] = {
        head: row.pull.head,
        ahead: queued
          .filter((each) => (each.entry?.position ?? 0) < position)
          .map((each) => each.pull.number),
        at: context.now.toISOString(),
      };
    }
    delete since[key];
    removed.push(row);
  }
  return removed;
}
