import { logLine, type PassContext } from "./context.ts";
import { hasBuiltOnLabel } from "./facts-pulls.ts";
import type { GateRow } from "./gate.ts";
import { autoLabel } from "./state.ts";
import { texts } from "./texts.ts";

/**
 * The auto-label rule (HAL-18506, the live Merger's since 25 Nov 12:16
 * UTC): an open pull request by the team account or the board's queue login
 * that has no `built-on:*` label is never a candidate, so it would wait out
 * of the queue for a label nobody adds. Once it is approved on its head and
 * `ci-ok` is green, merge control adds `built-on:paperclip` and posts one
 * note, once per head. It is never queued in that pass: the next pass reads
 * the label and gates it like any other.
 */

function ready(row: GateRow): boolean {
  return !row.noApproval && row.changeRequest === null && row.ci.state === "success";
}

/** Adds an `add-label` for each approved, green, unlabelled pull request by an auto-label author. */
export function autoLabels(context: PassContext, rows: readonly GateRow[]): void {
  const { state, settings } = context;
  for (const row of rows) {
    const { pull } = row;
    const author = pull.author ?? null;
    if (
      row.entry !== undefined ||
      pull.draft ||
      row.foreign ||
      hasBuiltOnLabel(pull.labels) ||
      author === null ||
      !settings.autoLabelAuthors.includes(author) ||
      !ready(row)
    ) {
      continue;
    }
    const key = `auto-label#${pull.number}`;
    if (state.noted[key] === pull.head) {
      continue;
    }
    state.noted[key] = pull.head;
    context.actions.push({
      kind: "add-label",
      number: pull.number,
      head: pull.head,
      label: autoLabel,
      key: `${key}@${pull.head}`,
      comment: texts.autoLabelled(pull.head),
    });
    logLine(
      context,
      "auto-label",
      `AUTO_LABEL #${pull.number} (approved and green on ${pull.head.slice(0, 9)}, no built-on label: adds ${autoLabel})`,
    );
  }
}
