import { type ConflictFileMap, conflictFilesText } from "./conflict-files.ts";
import { marker, type PullFacts, type Reason } from "./decide.ts";
import { pullKey } from "./facts.ts";
import type { PullSummary } from "./wake-status.ts";

/**
 * The comments the PR watcher writes on a task: the wake, with one line per
 * new state, and the done. Split from `watch.ts` to keep it under the size
 * limit (HAL-17922).
 */

const reasonText: Record<Reason["kind"], (head: string) => string> = {
  "ci-red": (head) => `\`ci-ok\` failed on its head \`${head}\`.`,
  conflict: () => "it conflicts with its base branch and isn't in the merge queue.",
  retargeted: (head) =>
    `its base changed after its last reopen or push, so GitHub keeps it blocked even with green checks. Close and reopen it (or push a commit) to run the check against the new base. Reopening keeps head \`${head}\`, so approvals on it still count.`,
  review: (head) => `there's a new review comment on its head \`${head}\`.`,
  approved: (head) =>
    `it has an approving GitHub review on its head \`${head}\`, which its base branch needs. Merge it on that head once \`ci-ok\` is green (\`--match-head-commit\`); nobody queues it for you.`,
  merged: () =>
    "it merged and `ci-ok` is green, but the task has comments since. Mark it done if nothing else is left.",
};

/** What `pr_status` would say about each open pull request the reasons name, once each. */
function statusLines(reasons: readonly Reason[], summary: PullSummary | undefined): string[] {
  if (summary === undefined) {
    return [];
  }
  const pulls = new Map(reasons.map(({ pull }) => [pullKey(pull), pull]));
  const lines = [...pulls.values()].flatMap((pull) =>
    summary(pull).map((line) => `- #${pull.number} ${line}`),
  );
  return lines.length === 0
    ? []
    : [
        "What `pr_status` says, as of this check. No need to check again unless you pushed since:",
        ...lines,
        "",
      ];
}

/**
 * The comment that wakes the author: one line per new state, a conflict with
 * its files, then each pull request's status from the same pass, then the
 * markers.
 */
export function wakeMessage(
  reasons: readonly Reason[],
  summary?: PullSummary,
  conflicts: ConflictFileMap = new Map(),
): string {
  const lines = reasons.map(({ pull, kind }) => {
    const files = kind === "conflict" ? conflictFilesText(conflicts.get(pullKey(pull))) : "";
    return `- [#${pull.number}](${pull.url}): ${reasonText[kind](pull.head.slice(0, 7))}${files}`;
  });
  return [
    "PR watcher: this needs you.",
    "",
    ...lines,
    "",
    ...statusLines(reasons, summary),
    ...reasons.map((reason) => marker(reason.key)),
  ].join("\n");
}

/** The comment that closes the task. */
export function doneMessage(pulls: readonly PullFacts[]): string {
  const links = pulls.map((pull) => `[#${pull.number}](${pull.url})`).join(", ");
  return `PR watcher: ${links} merged and \`ci-ok\` is green on the base branch, so this task is done.`;
}
