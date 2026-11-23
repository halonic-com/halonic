/**
 * The "Clarify acceptance criteria" task the thin-spec check adds under a
 * flagged task (HAL-17076). Pure text, so the tests can read it.
 */

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

/** The clarify task's description: what to do, and that the flag may be wrong. */
export function clarifyDescription(parent: { readonly identifier: string }, score: number) {
  return [
    `The thin-spec check flagged ${parent.identifier}: its text may not say what result is expected (score ${score.toFixed(2)}, flagged above 0.50). About 4 in 10 flags are on tasks that were clear enough, so check first.`,
    "",
    `1. Read ${parent.identifier}, the task it came from, the pull requests and code it touches.`,
    `2. If its text already says what the finished result is and how to check it, say so in a comment on ${parent.identifier} and mark this task done.`,
    `3. Otherwise add an **Acceptance criteria** section to ${parent.identifier}'s description: the exact behaviour, names, messages and shapes the writer must produce, and the tests or cases that show it. Keep everything else in the description as it is.`,
    "4. Mark this task done. That unblocks the writer.",
    "",
    "Don't change the task's assignee or scope; ask its requester if the criteria need a decision.",
  ].join("\n");
}
