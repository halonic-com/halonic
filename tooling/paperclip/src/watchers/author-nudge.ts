import { rebaseCommand } from "../merge-control/author-wake.ts";
import { short } from "../pr-watcher/decide.ts";
import { taskOfBranch } from "../pr-watcher/discover.ts";
import type { SnapshotPull, SnapshotRepo } from "../snapshot/shape.ts";

/**
 * The author nudges (HAL-17929), as the live watchers ran them on the night
 * of 24–25 Nov (Chief, HAL-17912): a stacked pull request whose base merged,
 * a green pull request whose task still sits with its author, an approved one
 * merge control can't queue, and a conflict on a parked task. Each wakes the
 * task its branch names once per head. They read only the pass's snapshot:
 * the PR watcher already wakes an unparked task for a conflict, so the
 * conflict nudge covers only the parked ones it leaves alone.
 */

export type NudgeKind = "stack_base_merged" | "review_ready" | "needs_hand_queue" | "conflict";

/** A task a branch names, as the nudges need it. */
export interface NudgeTask {
  /** Its holder is the agent its branch names, not a reviewer. */
  readonly withAuthor: boolean;
  /** It is in `backlog` or `blocked`. */
  readonly parked: boolean;
}

/** One nudge: the task to wake, whether to set it to `todo` first, and what to say. */
export interface AuthorNudge {
  readonly kind: NudgeKind;
  readonly number: number;
  readonly url: string;
  readonly head: string;
  /** The task's identifier, such as `HAL-17929`. */
  readonly task: string;
  /** Set the task to `todo` first: Paperclip wakes nobody on a parked or in-review task. */
  readonly todo: boolean;
  readonly text: string;
}

/** What the nudges keep between passes, per company: the head each one last went out for. */
export interface AuthorNudgeState {
  readonly version: 1;
  /** By `<kind> owner/name#123`. */
  readonly nudged: Readonly<Record<string, string>>;
}

export const emptyAuthorNudge: AuthorNudgeState = { version: 1, nudged: {} };

/** What a pass reads besides the snapshot. */
export interface AuthorNudgeInput {
  /** The tasks branches name, by identifier; a task not here is closed or unknown. */
  readonly tasks: ReadonlyMap<string, NudgeTask>;
  /** Branch prefixes merge control can't queue (a board-only setting); their owners merge by hand. */
  readonly handQueueBranches: readonly string[];
}

function approvedOnHead(pull: SnapshotPull): boolean {
  return (pull.open?.approvals ?? []).some(({ head }) => pull.head.startsWith(head));
}

/** The merged pull request a retargeted one was stacked on, if this snapshot has it. */
function mergedBase(read: SnapshotRepo, pull: SnapshotPull): SnapshotPull | undefined {
  const open = pull.open;
  if (open?.baseChangedSincePush !== true || pull.base !== read.defaultBranch) {
    return undefined;
  }
  const previous = open.previousBase;
  if (previous === undefined || previous === read.defaultBranch) {
    return undefined;
  }
  return read.pulls.find((listed) => listed.state === "merged" && listed.branch === previous);
}

function stackText(pull: SnapshotPull, base: SnapshotPull, defaultBranch: string): string {
  const lines = [
    `#${base.number} below it merged and GitHub moved it to \`${defaultBranch}\`. Rebase on ${defaultBranch}, then ask the reviewer to re-approve.`,
  ];
  if (pull.open?.mergeable === "no") {
    lines.push(
      `The move left a conflict with \`${defaultBranch}\`: \`git fetch origin && git rebase --onto origin/${defaultBranch} ${short(base.head)}\`, then push.`,
    );
  }
  if (approvedOnHead(pull)) {
    lines.push(
      `It is approved on head \`${short(pull.head)}\`: if only the rebase changes it, ask for a range-diff re-approval (HAL-14809), not a new review.`,
    );
  }
  return lines.join(" ");
}

/** The nudge kinds a pull request shows, with their text, before the once-per-head check. */
function nudgesOf(
  read: SnapshotRepo,
  pull: SnapshotPull,
  task: NudgeTask,
  input: AuthorNudgeInput,
): { kind: NudgeKind; todo: boolean; text: string }[] {
  const open = pull.open;
  if (open === null) {
    return [];
  }
  const found: { kind: NudgeKind; todo: boolean; text: string }[] = [];
  const base = mergedBase(read, pull);
  const green = !open.draft && open.ciOk === "success";
  const approved = approvedOnHead(pull);
  if (base !== undefined && task.withAuthor) {
    found.push({
      kind: "stack_base_merged",
      todo: true,
      text: stackText(pull, base, read.defaultBranch),
    });
  } else if (
    open.mergeable === "no" &&
    !open.inQueue &&
    !open.draft &&
    task.withAuthor &&
    task.parked
  ) {
    found.push({
      kind: "conflict",
      todo: true,
      text: `it conflicts with \`${read.defaultBranch}\` and isn't in the merge queue. Rebase on ${read.defaultBranch}: \`${rebaseCommand}\`, then push.`,
    });
  }
  if (green && !approved && open.mergeable !== "no" && task.withAuthor && !task.parked) {
    found.push({
      kind: "review_ready",
      todo: false,
      text: `it is out of draft with \`ci-ok\` green on head \`${short(pull.head)}\`, but its task is still with you. Hand the task to the reviewer with status \`todo\` (\`pr_status\` names them, by \`reviewerFor\`).`,
    });
  }
  const unqueueable = input.handQueueBranches.some((prefix) => pull.branch.startsWith(prefix));
  if (green && approved && open.mergeable === "yes" && !open.inQueue && unqueueable) {
    found.push({
      kind: "needs_hand_queue",
      todo: false,
      text: `it is approved and green on head \`${short(pull.head)}\`, but merge control can't queue it (its settings say so). Merge it by hand on that head (\`--match-head-commit\`).`,
    });
  }
  return found;
}

/**
 * The nudges due in this pass on the watched repository, and the state to
 * save. Only its own branches that name a task count. A nudge already sent
 * for this head is not sent again; a new head allows one more. A repository
 * the snapshot didn't read keeps what it had.
 */
export function authorNudgePass(
  read: SnapshotRepo | undefined,
  before: AuthorNudgeState,
  input: AuthorNudgeInput,
): { readonly nudges: readonly AuthorNudge[]; readonly state: AuthorNudgeState } {
  if (read === undefined) {
    return { nudges: [], state: before };
  }
  const nudged: Record<string, string> = {};
  const nudges: AuthorNudge[] = [];
  for (const pull of read.pulls) {
    const taskId = taskOfBranch(pull.branch);
    const task = taskId === undefined ? undefined : input.tasks.get(taskId);
    const ours = pull.headRepo?.toLowerCase() === read.repo.toLowerCase();
    if (pull.state !== "open" || !ours || taskId === undefined || task === undefined) {
      continue;
    }
    for (const nudge of nudgesOf(read, pull, task, input)) {
      const key = `${nudge.kind} ${read.repo}#${pull.number}`;
      nudged[key] = pull.head;
      if (before.nudged[key] !== pull.head) {
        nudges.push({
          ...nudge,
          number: pull.number,
          url: pull.url,
          head: pull.head,
          task: taskId,
        });
      }
    }
  }
  for (const [key, head] of Object.entries(before.nudged)) {
    if (!key.includes(` ${read.repo}#`)) {
      nudged[key] = head;
    }
  }
  return { nudges, state: { version: 1, nudged } };
}

/** One task's comment: a line per nudge, then the markers that name each one's head. */
export function authorNudgeText(nudges: readonly AuthorNudge[]): string {
  return [
    "Merge watcher: this needs you.",
    "",
    ...nudges.map((nudge) => `- [#${nudge.number}](${nudge.url}): ${nudge.text}`),
    "",
    ...nudges.map(
      (nudge) => `<!-- merge-watchers: ${nudge.kind} #${nudge.number} ${short(nudge.head)} -->`,
    ),
  ].join("\n");
}
