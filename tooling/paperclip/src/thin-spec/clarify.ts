/**
 * The "Clarify acceptance criteria" task the thin-spec check adds under a
 * flagged task (HAL-17076). Pure text, so the tests can read it.
 */

import { specTemplateLink } from "./done-when.ts";

/** Every clarify task's title starts with this, so the check never checks its own tasks. */
export const clarifyTitlePrefix = "Clarify acceptance criteria:";

/** Whether a title is a clarify task's. */
export function isClarifyTask(title: string): boolean {
  return title.startsWith(clarifyTitlePrefix);
}

/** The clarify task's title. */
export function clarifyTitle(parent: { readonly identifier: string; readonly title: string }) {
  return `${clarifyTitlePrefix} ${parent.identifier} ${parent.title}`.slice(0, 200);
}

/** Why a task got a clarify task: its thin-spec score above the threshold, a missing `Done when` line, or both. */
export interface ClarifyReasons {
  /** The thin-spec score, when it flagged the task. */
  readonly score?: number;
  readonly doneWhenMissing: boolean;
}

function flagLines(identifier: string, reasons: ClarifyReasons): string[] {
  const lines: string[] = [];
  if (reasons.score !== undefined) {
    lines.push(
      `The thin-spec check flagged ${identifier}: its text may not say what result is expected (score ${reasons.score.toFixed(2)}, flagged above 0.50). About 4 in 10 flags are on tasks that were clear enough, so check first.`,
    );
  }
  if (reasons.doneWhenMissing) {
    lines.push(
      `${identifier} has no checkable **Done when** line: one naming a test, a command in backticks, or what the user sees ([spec template](${specTemplateLink})).`,
    );
  }
  return lines;
}

/** The clarify task's description: why it was flagged, what to do, and that the flag may be wrong. */
export function clarifyDescription(
  parent: { readonly identifier: string },
  reasons: ClarifyReasons,
) {
  return [
    ...flagLines(parent.identifier, reasons),
    "",
    `1. Read ${parent.identifier}, the task it came from, the pull requests and code it touches.`,
    `2. If its text already says what the finished result is and how to check it, say so in a comment on ${parent.identifier} and mark this task done.`,
    `3. Otherwise add an **Acceptance criteria** section to ${parent.identifier}'s description: the exact behaviour, names, messages and shapes the writer must produce, and the tests or cases that show it, ending with a checkable **Done when** line. Keep everything else in the description as it is.`,
    "4. Mark this task done. That unblocks the writer.",
    "",
    "Don't change the task's assignee or scope; ask its requester if the criteria need a decision.",
  ].join("\n");
}
