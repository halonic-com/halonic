import { commentOnce, logLine, minutesSince, type PassContext } from "./context.ts";
import type { Wait } from "./fill.ts";
import type { GateRow } from "./gate.ts";
import { texts } from "./texts.ts";

/**
 * The not-queued note (HAL-18735): an approved pull request with a green
 * `ci-ok` on its head that has waited out of the queue for 30 minutes is
 * told why, once per head. A reason another note already gave on that head
 * (file size, blocked, culprit hold, live cloud) isn't told again.
 */

/** Minutes an approved, green head may wait out of the queue before it is told why. */
export const notQueuedMinutes = 30;

/** Approved and green on its head, out of the queue, and one the queue would take. */
function approvedGreenOutside(row: GateRow, added: readonly number[]): boolean {
  return (
    row.entry === undefined &&
    !added.includes(row.pull.number) &&
    row.candidate &&
    !row.pull.draft &&
    !row.foreign &&
    !row.noApproval &&
    row.changeRequest === null &&
    row.ci.state === "success"
  );
}

/** Every reason the gate and the fill gave, with the note kind that already told it, if any. */
function reasonsOf(context: PassContext, row: GateRow): Wait[] {
  const gate = row.reasons.map((why) => ({
    why,
    ...(row.sizeHold !== undefined && why.startsWith("file size:") ? { noted: "size" } : {}),
  }));
  const wait = context.waits.get(row.pull.number);
  const unknown =
    row.reasons.length === 0 && row.pull.mergeable !== "MERGEABLE"
      ? [{ why: "GitHub hasn't worked out yet whether it merges cleanly with main" }]
      : [];
  return [...gate, ...(wait === undefined ? [] : [wait]), ...unknown];
}

/** Starts, keeps or clears each pull request's wait, and posts the note once it is 30 minutes old. */
export function notQueuedNotes(
  context: PassContext,
  rows: readonly GateRow[],
  added: readonly number[],
): void {
  const since = context.state.notQueuedSince;
  const waiting = rows.filter((row) => approvedGreenOutside(row, added));
  for (const key of Object.keys(since)) {
    if (!waiting.some((row) => String(row.pull.number) === key)) {
      delete since[key];
    }
  }
  for (const row of waiting) {
    const { number, head } = row.pull;
    const key = String(number);
    if (since[key]?.head !== head) {
      since[key] = { head, at: context.now.toISOString() };
    }
    const minutes = Math.floor(minutesSince(context, since[key]?.at ?? ""));
    if (minutes < notQueuedMinutes) {
      continue;
    }
    const untold = reasonsOf(context, row)
      .filter(
        (wait) =>
          wait.noted === undefined || context.state.noted[`${wait.noted}#${number}`] !== head,
      )
      .map((wait) => wait.tell ?? wait.why);
    if (untold.length === 0) {
      continue;
    }
    if (commentOnce(context, "not-queued", number, head, texts.notQueued(head, minutes, untold))) {
      logLine(context, "not-queued", `#${number} after ${minutes} min: ${untold.join("; ")}`);
    }
  }
}
