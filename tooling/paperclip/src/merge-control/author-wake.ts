import { branchOwner } from "../pr-watcher/decide.ts";
import { taskOfBranch } from "../pr-watcher/discover.ts";
import { logLine, type PassContext } from "./context.ts";
import type { GatePull } from "./snapshot.ts";
import type { RemovalReason } from "./state.ts";

/**
 * Wakes the author when a pull request leaves the queue (HAL-17907): a
 * `wake` on the task its branch names (`<agent>/HAL-<n>-…`), with what
 * failed and what to run, so the author starts at once instead of on the
 * PR watcher's next round. The live Merger's `author-wake.js` has the same
 * texts and table; change both together.
 */

/** Rebases on the newest `main`; the first step for every failure in a merge group. */
export const rebaseCommand = "git fetch origin && git rebase origin/main";

/** The command that runs a failed CI job's checks locally, by the job's name. */
const jobCommands: readonly { readonly job: RegExp; readonly command: string }[] = [
  {
    job: /^Typecheck, lint, test, build \(/,
    command: "pnpm exec turbo run typecheck lint test build --filter=...[origin/main]",
  },
  { job: /^Fast gates$/, command: "pnpm check" },
  {
    job: /^Leak guard$/,
    command: "pnpm exec node tooling/check/src/cli/leaks.ts --range origin/main..HEAD",
  },
  { job: /^Requirements and their tests \(trace\)$/, command: "pnpm check trace" },
  {
    job: /^Tauri shell \(Rust checks\)$/,
    command:
      "cd apps/studio/src-tauri && cargo clippy --locked --workspace --all-targets -- -D warnings && cargo test --locked --workspace",
  },
  { job: /^Studio end-to-end \(Playwright\)$/, command: "pnpm e2e" },
];

/** For a job the table doesn't know: the full check before queueing. */
export const fallbackCommand = "pnpm check:enqueue";

/** The local command for a failed job. */
export function commandForJob(job: string): string {
  return jobCommands.find((each) => each.job.test(job))?.command ?? fallbackCommand;
}

/** What the author does after each removal reason; `foreign` wakes nobody. */
const removalSteps: Readonly<Record<Exclude<RemovalReason, "foreign">, string>> = {
  conflict: `What to run: \`${rebaseCommand}\`, then push.`,
  unmergeable: `What to run: \`${rebaseCommand}\`, then push.`,
  "change-request":
    "What to do: fix the review findings on the PR, push, and assign the task to the reviewer again.",
  "head-moved":
    "What to do: get a signed approval on the current head: assign the task to the reviewer with status `todo`.",
  "no-signed-approval":
    "What to do: get a signed approval on the current head: assign the task to the reviewer with status `todo`.",
  "board-hold": "Nothing to run: it goes back in once the board lifts the hold.",
};

/** The wake comment's lines for a pull request the queue manager took out on a gate check. */
export function removalFacts(
  pull: Pick<GatePull, "number" | "head">,
  reason: Exclude<RemovalReason, "foreign">,
  why: string,
): string[] {
  return [
    `Queue manager: #${pull.number} (head \`${pull.head.slice(0, 9)}\`) was removed from the merge queue: ${why}.`,
    removalSteps[reason],
    "The queue manager re-adds it once it passes the gate; don't queue it yourself.",
  ];
}

/** The wake comment's lines for a pull request whose merge group failed. */
export function failedGroupFacts(
  pull: Pick<GatePull, "number" | "head">,
  jobs: readonly string[],
  url: string,
): string[] {
  const names =
    jobs.length > 0 ? jobs.map((job) => `\`${job}\``).join(", ") : "a job (see the run)";
  const commands = [...new Set((jobs.length > 0 ? jobs : [""]).map(commandForJob))];
  return [
    `Queue manager: #${pull.number} (head \`${pull.head.slice(0, 9)}\`) was taken out of the merge queue: its merge group failed in ${names}: ${url}`,
    `What to run: \`${rebaseCommand}\`, then ${commands.map((command) => `\`${command}\``).join(", then ")}.`,
    "Fix what fails and push: it isn't queued again until it has a new head. If the failure isn't from this PR's code, say so on the PR and push a rebase.",
  ];
}

/**
 * Adds a `wake` for the task the pull request's branch names, once per event
 * and head. A branch that names no task or agent wakes nobody and is logged.
 */
export function wakeAuthor(
  context: PassContext,
  pull: Pick<GatePull, "number" | "head" | "branch">,
  event: "removed" | "group-failed",
  facts: readonly string[],
): boolean {
  const task = taskOfBranch(pull.branch);
  const agent = branchOwner(pull.branch);
  if (task === undefined || agent === undefined) {
    logLine(
      context,
      "author-wake",
      `#${pull.number}: branch ${pull.branch} names no task; nobody woken`,
    );
    return false;
  }
  const key = `wake-${event}#${pull.number}`;
  if (context.state.noted[key] === pull.head) {
    return false;
  }
  context.state.noted[key] = pull.head;
  context.actions.push({ kind: "wake", agent, task, key: `${key}@${pull.head}`, facts });
  logLine(context, "author-wake", `#${pull.number} -> ${task} (${agent}): ${event}`);
  return true;
}
