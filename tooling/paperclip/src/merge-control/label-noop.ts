import { logLine, minutesSince, type PassContext } from "./context.ts";
import type { GateRow } from "./gate.ts";
import { texts } from "./texts.ts";

/**
 * The label-noop self-fix (HAL-18470, the live Merger's since 25 Nov 12:02
 * UTC): an approved pull request whose current head shows `label-noop`
 * waits for a close and reopen that nobody does, so merge control posts one
 * comment, then closes and reopens it, at most once per head. A second head
 * of the same pull request within a day isn't reopened: the pass logs
 * `LABEL_NOOP_LOOP` instead of looping. Reopens are kept 2 days.
 */

/** A reopen this recent on another head stops the next one. */
export const labelNoopLoopMinutes = 24 * 60;

/** How long a reopen is kept. */
export const labelNoopKeepMinutes = 2 * 24 * 60;

function approved(row: GateRow): boolean {
  return !row.noApproval && row.changeRequest === null;
}

function prune(context: PassContext): void {
  const done = context.state.labelNoopReopened;
  for (const [key, reopens] of Object.entries(done)) {
    const kept = reopens.filter((each) => minutesSince(context, each.at) < labelNoopKeepMinutes);
    if (kept.length === 0) {
      delete done[key];
    } else {
      done[key] = kept;
    }
  }
}

/** Adds a `reopen` for each approved, unqueued candidate whose head shows `label-noop`. */
export function labelNoopReopens(context: PassContext, rows: readonly GateRow[]): void {
  prune(context);
  const done = context.state.labelNoopReopened;
  const reopened: string[] = [];
  const loops: string[] = [];
  for (const row of rows) {
    const { pull } = row;
    if (
      row.entry !== undefined ||
      pull.draft ||
      !row.candidate ||
      row.ci.state !== "label-noop" ||
      !approved(row)
    ) {
      continue;
    }
    const key = String(pull.number);
    const before = done[key] ?? [];
    if (before.some((each) => each.head === pull.head)) {
      continue;
    }
    if (before.some((each) => minutesSince(context, each.at) < labelNoopLoopMinutes)) {
      loops.push(`#${pull.number}`);
      continue;
    }
    done[key] = [...before, { head: pull.head, at: context.now.toISOString() }];
    context.actions.push({
      kind: "reopen",
      number: pull.number,
      pullId: pull.id,
      head: pull.head,
      comment: texts.labelNoopReopen(pull.head),
    });
    reopened.push(`#${pull.number}`);
  }
  if (reopened.length > 0) {
    logLine(context, "label-noop", `labelNoopReopened=${reopened.join(",")}`);
  }
  if (loops.length > 0) {
    logLine(
      context,
      "label-noop",
      `LABEL_NOOP_LOOP ${loops.join(" ")}: reopened on another head within a day; not again`,
    );
  }
}
