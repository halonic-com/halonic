import { commandForJob, rebaseCommand } from "../merge-control/author-wake.ts";
import { type ConflictFileMap, conflictFilesText } from "./conflict-files.ts";
import { marker, type PullFacts, type Reason } from "./decide.ts";
import { pullKey } from "./facts.ts";
import { requiredFix } from "./required-workflows.ts";
import type { PullSummary } from "./wake-status.ts";

/**
 * The comments the PR watcher writes on a task: the wake, with one line per
 * new state, and the done. Split from `watch.ts` to keep it under the size
 * limit (HAL-17922).
 */

/** A held head's line: the failed jobs, the run, the error line when read, and what to run. */
function heldText(head: string, { pull }: Reason): string {
  const jobs = pull.held?.jobs ?? [];
  const names =
    jobs.length > 0 ? jobs.map((job) => `\`${job}\``).join(", ") : "a job (see the run)";
  const commands = [...new Set((jobs.length > 0 ? jobs : [""]).map(commandForJob))];
  const error = pull.held?.error == null ? "" : ` Error: \`${pull.held.error}\`.`;
  return [
    `its merge group failed in ${names}, so the queue manager holds head \`${head}\` out of the queue until it has a new head: ${pull.held?.url ?? ""}.${error}`,
    `What to run: \`${rebaseCommand}\`, then ${commands.map((command) => `\`${command}\``).join(", then ")}. Fix what fails and push. If the failure isn't from this PR's code, say so on the PR and push a rebase.`,
  ].join(" ");
}

const reasonText: Record<Reason["kind"], (head: string, reason: Reason) => string> = {
  "ci-red": (head) => `\`ci-ok\` failed on its head \`${head}\`.`,
  conflict: () => "it conflicts with its base branch and isn't in the merge queue.",
  retargeted: (head) =>
    `its base changed after its last reopen or push, so GitHub keeps it blocked even with green checks. Close and reopen it (or push a commit) to run the check against the new base. Reopening keeps head \`${head}\`, so approvals on it still count.`,
  review: (head) => `there's a new review comment on its head \`${head}\`.`,
  approved: (head) =>
    `it has an approving GitHub review on its head \`${head}\`, which its base branch needs. Merge it on that head once \`ci-ok\` is green (\`--match-head-commit\`); nobody queues it for you.`,
  merged: () =>
    "it merged and `ci-ok` is green, but the task has comments since. Mark it done if nothing else is left.",
  held: heldText,
  "required-failed": (head, { failed }) =>
    `the required workflow \`${failed?.workflow}\` failed on its head \`${head}\` (job \`${failed?.job}\`), so GitHub won't merge it even with \`ci-ok\` green. ${requiredFix(failed?.workflow ?? "")}`,
  "stack-conflict": (head, { base }) =>
    `#${base?.number} below it merged, and GitHub couldn't rebase it on \`main\` (head \`${head}\`). Rebase it without #${base?.number}'s old commits: \`git rebase --onto origin/main ${base?.head.slice(0, 7)}\`, then push.`,
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
  const lines = reasons.map((reason) => {
    const { pull, kind } = reason;
    const conflict = kind === "conflict" || kind === "stack-conflict";
    const files = conflict ? conflictFilesText(conflicts.get(pullKey(pull))) : "";
    return `- [#${pull.number}](${pull.url}): ${reasonText[kind](pull.head.slice(0, 7), reason)}${files}`;
  });
  return [
    "PR watcher: this needs you.",
    "",
    ...lines,
    "",
    ...statusLines(reasons, summary),
    ...reasons.flatMap((reason) => [reason.key, ...(reason.also ?? [])].map(marker)),
  ].join("\n");
}

/** The comment that closes the task. */
export function doneMessage(pulls: readonly PullFacts[]): string {
  const links = pulls.map((pull) => `[#${pull.number}](${pull.url})`).join(", ");
  return `PR watcher: ${links} merged and \`ci-ok\` is green on the base branch, so this task is done.`;
}
