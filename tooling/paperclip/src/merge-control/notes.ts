import { commentOnce, type PassContext } from "./context.ts";
import type { GateRow } from "./gate.ts";
import { texts } from "./texts.ts";

/**
 * One-line notes on pull requests that wait out of the queue, each once per
 * head (MERGER.md §4 "Comments"); on a branch outside the repository, once.
 */

function waitingOutside(row: GateRow): boolean {
  return row.entry === undefined && row.candidate && !row.pull.draft;
}

const approvalOnly = /^(no approval from Liam|waiting for re-review|Liam's latest review)/;

function approvalNotes(context: PassContext, row: GateRow, added: readonly number[]): void {
  const { number, head } = row.pull;
  const clean =
    row.pull.mergeable === "MERGEABLE" && row.ci.state === "success" && row.changeRequest === null;
  if (!clean) {
    return;
  }
  if (row.reasons.length > 0 && row.reasons.every((reason) => approvalOnly.test(reason))) {
    commentOnce(
      context,
      "waiting-approval",
      number,
      head,
      texts.waitingApproval(row.reasons[0] ?? "", head),
    );
  }
  // HAL-16399: approved and green, but GitHub says BLOCKED (a stacked PR retargeted to main).
  const blocked =
    !added.includes(number) &&
    !row.noApproval &&
    row.pull.base === "main" &&
    row.pull.mergeStateStatus === "BLOCKED";
  if (blocked) {
    commentOnce(context, "blocked", number, head, texts.blocked(head));
  }
}

/** The notes for the pull requests the pass didn't add. */
export function notes(
  context: PassContext,
  rows: readonly GateRow[],
  added: readonly number[],
): void {
  for (const row of rows.filter(waitingOutside)) {
    const { number, head } = row.pull;
    if (row.foreign) {
      // Once per pull request, whatever its head.
      if (context.state.noted[`foreign#${number}`] === undefined) {
        commentOnce(context, "foreign", number, head, texts.notQueuedForeign);
      }
      continue;
    }
    if (row.sizeHold !== undefined) {
      const body = texts.fileSize(row.sizeHold, context.settings.fileSizeLimit);
      commentOnce(context, "size", number, head, body);
    }
    approvalNotes(context, row, added);
  }
}
