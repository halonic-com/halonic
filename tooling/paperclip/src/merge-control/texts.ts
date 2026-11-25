import type { SizeHold } from "./gate.ts";

/**
 * Every pull request comment merge control posts: the Merger's texts,
 * without `@` names (HAL-14420). A test checks that none has one.
 */

export const texts = {
  removedForeign:
    "Queue manager: removed from the merge queue. The merge queue only takes PRs from branches in this repository.",
  notQueuedForeign:
    "Queue manager: this PR is not queued. The merge queue only takes PRs from branches in this repository.",
  removedHold: (why: string) =>
    `Removed from the merge queue: held out by the board: ${why}. It goes back in once the board lifts the hold.`,
  removedReReview: (reason: string) =>
    `Removed from the merge queue: ${reason}. The queue manager re-adds it once Liam approves this head.`,
  removedGate: (head: string, reasons: readonly string[]) =>
    [
      "**Removed from the merge queue** by the queue manager (board rule from 20 Nov: only PRs that pass the gate go into the queue).",
      "",
      `Gate check on head \`${head.slice(0, 9)}\`:`,
      ...reasons.map((reason) => `- ${reason}`),
      "",
      "What to do: fix the items above (rebase on `main` if asked, get Liam's approval comment on the new head, and a green `ci-ok` on it). " +
        "The queue manager re-adds the PR once it passes; please don't put it in the queue yourself.",
    ].join("\n"),
  unmergeableSince: (since: string) =>
    `GitHub has marked it unmergeable in the queue since ${since.slice(11, 16)} UTC: it conflicts with a PR ahead of it in the queue or with main. Please rebase on main`,
  conflict: "conflicts with main: please rebase",
  culprit: (jobs: readonly string[], url: string) =>
    `Queue manager: this PR was taken out of the merge queue because its merge group failed in ${
      jobs.length > 0 ? jobs.map((job) => `\`${job}\``).join(", ") : "a job (see the run)"
    }: ${url}\nIt will not be queued again until it has a new head. If the failure is not from this PR's code, say so on this PR and push a rebase.`,
  liveCloud: "Waiting for the live cloud suites to pass on this head (`live-cloud` check).",
  carried: (from: string, to: string) =>
    `Approval of ${from.slice(0, 9)} carried to ${to.slice(0, 9)}: rebase only, identical diff.`,
  fileSize: (hold: SizeHold, limit: number) => {
    const parts = [
      `main ${hold.main}`,
      ...hold.ahead.map((each) => `#${each.n} ${each.net >= 0 ? "+" : ""}${each.net} (queued)`),
      `this PR +${hold.net}`,
    ].join(", ");
    return `Queue manager: this PR is not queued yet. On top of current main and the PRs already queued, \`${hold.file}\` would be ${hold.total} lines (${parts}); the repo check's limit is ${limit}, so its merge group would fail Fast gates. Please split the file by concept (one file per view, service or helper) and push; the queue manager adds the PR once the new head passes the gate.`;
  },
  waitingApproval: (reason: string, head: string) =>
    `Queue manager: this PR is clean and green but not queued: ${reason}. It goes in on the next pass after Liam's approval names head \`${head.slice(0, 9)}\`.`,
  blocked: (head: string) =>
    `Queue manager: approved and \`ci-ok\` is green on \`${head.slice(0, 9)}\`, but GitHub shows this PR as blocked, so I can't queue it. If its base changed (a stacked PR whose lower PR merged), rebase it on \`main\` and push (or push an empty commit) so the required note check runs against \`main\`: an identical diff keeps the approval (carry-over). Closing and reopening also reruns the check; a reopen with an unchanged head keeps the approval.`,
  labelNoopReopen: (head: string) =>
    `Queue manager: approved, but a label run came after CI on head \`${head.slice(0, 9)}\`, so GitHub sees no \`ci-ok\` and can't queue this PR. Closing and reopening it once to run CI again: the head stays the same, so the approval stays. Nothing to do; it is queued once \`ci-ok\` is green.`,
  dequeuedAtFailure: (url: string) =>
    `Queue manager: took this PR out of the merge queue because its merge group failed: ${url}\nA PR ahead of it in the group is the likely cause, so it can go back in on this head.`,
  autoLabelled: (head: string) =>
    `Queue manager: approved and \`ci-ok\` is green on \`${head.slice(0, 9)}\`, but this PR had no \`built-on:*\` label, so the queue skipped it. Added \`built-on:paperclip\`; the next pass checks it for the queue as usual. Nothing to do.`,
  notQueued: (head: string, minutes: number, reasons: readonly string[]) =>
    [
      `Queue manager: approved and \`ci-ok\` is green on \`${head.slice(0, 9)}\`, but this PR has waited out of the merge queue for ${minutes} minutes. Why:`,
      ...reasons.map((reason) => `- ${reason}`),
      "",
      "A rebase, a retarget or a file split is yours to do: push, and the queue manager adds the PR once the new head passes. Holds, pauses and a full queue clear without you; please don't queue the PR yourself.",
    ].join("\n"),
  brakeOn: (minutes: number) =>
    `Runner wait ${minutes} min on merge-group jobs: please hold pushes.`,
  brakeOff: "Runner wait cleared.",
  mainBroken: (files: string, url: string) =>
    `MAIN_BROKEN in ${files} (${url}): the group's PR stays held on its head; main-red freeze on until a push run on main is green or red only in known-flaky jobs, or a merge group is green.`,
} as const;
