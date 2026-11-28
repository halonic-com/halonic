import type { FailedWorkflow } from "./required-workflows.ts";

/**
 * What the PR watcher does with one task, worked out from facts only: mark
 * it done, wake its author, or leave it alone. No I/O here, so every rule
 * is tested without GitHub or Paperclip.
 */

/** A `ci-ok` result. `missing` means GitHub has no such check (yet). */
export type CheckState = "success" | "failure" | "pending" | "missing";

/** What the watcher read about one pull request. */
export interface PullFacts {
  readonly repo: string;
  readonly number: number;
  readonly url: string;
  readonly state: "open" | "merged" | "closed";
  readonly branch: string;
  readonly head: string;
  /** Open only: `ci-ok` on the head commit. */
  readonly ciOkOnHead: CheckState;
  /** Open only: it is a draft, so a conflict is the author's work in progress. */
  readonly draft: boolean;
  /** Open only: GitHub says it can't merge into its base. */
  readonly conflicting: boolean;
  /** Open only, read only when conflicting: it sits in the merge queue. */
  readonly inQueue: boolean;
  /** Open only: its base changed after its last reopen or push, so GitHub keeps it blocked. */
  readonly retargeted: boolean;
  /** Open only: checks the merge queue requires with no run on the head, such as `Guard notes`. */
  readonly missingChecks?: readonly string[];
  /** Open only: required workflows besides CI whose newest run on the head failed (HAL-19031). */
  readonly failedRequired?: readonly FailedWorkflow[];
  /**
   * Open only: the newest review or inline comment made on the current head,
   * with the reviewer its text names (Liam or Julian) when it names one.
   */
  readonly latestReview:
    | { readonly id: string; readonly at: string; readonly by?: string }
    | undefined;
  /** Open only: when the head commit was committed, so a push after a finding shows (HAL-18460). */
  readonly headCommittedAt?: string;
  /** Open only: GitHub committed the head, as the watcher's stack rebase does: no fix of the author's. */
  readonly headCommittedByGitHub?: boolean;
  /** Open only: our reviewers' signed approvals, oldest first, each with the head it names. */
  readonly approvals?: readonly {
    readonly by: string;
    readonly head: string;
    /** The head Liam approved, when this is a re-approval after a rebase-only push. */
    readonly rebaseOf?: string;
  }[];
  /**
   * Open only, on a repository whose base branch needs it (`githubReviewRepos`):
   * an approving GitHub review on the head by an account other than the
   * agents' shared one. It is also in `approvals`.
   */
  readonly githubApproval?: { readonly by: string; readonly head: string };
  /**
   * Open only: merge control holds this head because its merge group failed
   * (HAL-18147), with the run, its failed jobs and an error line when one was read.
   */
  readonly held?: {
    readonly url: string;
    readonly jobs: readonly string[];
    readonly error: string | null;
  };
  /** Merged only: `ci-ok` passed on the merge commit, or a later base-branch commit is green. */
  readonly landed: boolean;
  /** Merged only: when it merged. */
  readonly mergedAt: string | undefined;
}

/** The task, as far as the watcher cares. */
export interface WatchedTask {
  readonly id: string;
  readonly identifier: string;
  readonly assigneeAgentId: string | null;
  /** A run of its assignee is queued or running, so a wake would add nothing. */
  readonly running: boolean;
  /** It has a child task that isn't done or cancelled, so its work isn't finished. */
  readonly openChildren: boolean;
  /** It is in `backlog` or `blocked`, as a stacked pull request's task often is until the one below merges. */
  readonly parked?: boolean;
  /** When its Paperclip monitor checks next, or null without one: its holder waits on something. */
  readonly monitorNextCheckAt?: string | null;
}

/** One state the author should hear about. `key` says when it is the same state again. */
export interface Reason {
  readonly pull: PullFacts;
  readonly kind:
    | "ci-red"
    | "conflict"
    | "retargeted"
    | "review"
    | "approved"
    | "merged"
    | "stack-conflict"
    | "held"
    | "required-failed";
  readonly key: string;
  /** `required-failed` only: the workflow that failed and its job. */
  readonly failed?: FailedWorkflow;
  /** `stack-conflict` only: the keys of the reasons it answers, marked as reported with it. */
  readonly also?: readonly string[];
  /** `stack-conflict` only: the merged pull request it was stacked on and that one's last head. */
  readonly base?: { readonly number: number; readonly head: string };
}

/** What the watcher reported on the task before, read back from its own comments. */
export interface Memory {
  readonly reported: ReadonlySet<string>;
  /** The newest of the watcher's last comment and the author's last comment. */
  readonly seenUntil: string | undefined;
  /** When the author's newest comment, saying more pull requests are coming, was written; undefined without one. */
  readonly heldAt: string | undefined;
  /** The newest comment on the task by anyone but the watcher. */
  readonly lastCommentAt: string | undefined;
  /** The author's newest comment on the task says its pull request has a review task of its own. */
  readonly ownReview?: boolean;
  /** When the author last commented on the task. */
  readonly authorLastAt?: string | undefined;
  /** The pull requests and heads the queue manager's wakes on the task name (HAL-18722). */
  readonly queueRequests?: readonly { readonly number: number; readonly head: string }[];
  /** The newest comments by anyone but the watcher, newest first, at most 3 (HAL-18284). */
  readonly recentComments?: readonly string[];
  /** The task the author's newest comment says its pull request moved to (HAL-18284). */
  readonly movedTo?: string;
}

/** The outcome for one task. */
export type Decision =
  | { readonly kind: "skip"; readonly why: string }
  | { readonly kind: "done"; readonly pulls: readonly PullFacts[] }
  | { readonly kind: "wake"; readonly reasons: readonly Reason[] };

/** The agent a branch belongs to: `mateo/HAL-1-x` belongs to `mateo`. */
export function branchOwner(branch: string): string | undefined {
  const slash = branch.indexOf("/");
  return slash > 0 ? branch.slice(0, slash).toLowerCase() : undefined;
}

/** The one agent every branch names, or undefined when they name none or several. */
export function branchesOwner(branches: readonly string[]): string | undefined {
  const owners = new Set(branches.map(branchOwner));
  const [owner] = owners;
  return owners.size === 1 ? owner : undefined;
}

/** The hidden line that lets the watcher recognise a state it already reported. */
export function marker(key: string): string {
  return `<!-- pr-watcher: ${key} -->`;
}

/** A commit's first 7 characters, as the watcher's keys and comments name it. */
export function short(sha: string): string {
  return sha.slice(0, 7);
}

/**
 * Everything about the open pull requests that may need the author, before
 * the watcher checks whether it already told them. A failed merge group is
 * here only once merge control has found the culprit and holds its head.
 */
export function candidates(pulls: readonly PullFacts[]): Reason[] {
  return pulls.filter((each) => each.state === "open").flatMap(openReasons);
}

/** The states of one open pull request that may need its author. */
function openReasons(pull: PullFacts): Reason[] {
  const found: Reason[] = [];
  const at = `${pull.repo}#${pull.number} ${short(pull.head)}`;
  if (pull.ciOkOnHead === "failure") {
    found.push({ pull, kind: "ci-red", key: `${at} ci-red` });
  }
  if (pull.conflicting && !pull.inQueue && !pull.draft) {
    found.push({ pull, kind: "conflict", key: `${at} conflict` });
  }
  if (pull.retargeted && !pull.inQueue && !pull.draft) {
    found.push({ pull, kind: "retargeted", key: `${at} retargeted` });
  }
  if (!pull.draft) {
    for (const failed of pull.failedRequired ?? []) {
      found.push({ pull, kind: "required-failed", key: `${at} ${failed.workflow} failed`, failed });
    }
  }
  if (pull.latestReview !== undefined) {
    found.push({ pull, kind: "review", key: `${at} review ${pull.latestReview.id}` });
  }
  if (pull.held !== undefined) {
    found.push({ pull, kind: "held", key: `${at} held` });
  }
  // Nobody queues on such a repository: whoever holds the task merges it.
  if (pull.githubApproval !== undefined && !pull.draft && !pull.inQueue) {
    found.push({ pull, kind: "approved", key: `${at} approved on GitHub` });
  }
  return found;
}

/** The candidates the author hasn't heard about: once per new state, not every tick. */
export function newReasons(found: readonly Reason[], memory: Memory): Reason[] {
  const seenUntil = memory.seenUntil === undefined ? Number.NaN : Date.parse(memory.seenUntil);
  return found.filter((reason) => {
    if (memory.reported.has(reason.key)) {
      return false;
    }
    if (reason.kind === "review" && reason.pull.latestReview !== undefined) {
      // A review the author or the watcher has already been around for.
      return !(Date.parse(reason.pull.latestReview.at) <= seenUntil);
    }
    return true;
  });
}

/**
 * Done, or still waiting: done only when no pull request is open and every
 * merged one has landed green.
 */
export function closedOutcome(pulls: readonly PullFacts[]): Decision | undefined {
  if (pulls.some((pull) => pull.state === "open")) {
    return undefined;
  }
  const merged = pulls.filter((pull) => pull.state === "merged");
  if (merged.length === 0) {
    return { kind: "skip", why: "its pull requests closed without merging" };
  }
  if (merged.some((pull) => !pull.landed)) {
    return { kind: "skip", why: "merged, waiting for a green ci-ok on the base branch" };
  }
  return { kind: "done", pulls: merged };
}

/** When the newest of these pull requests merged. */
function lastMergeAt(pulls: readonly PullFacts[]): string | undefined {
  return pulls.reduce<string | undefined>(
    (last, pull) =>
      pull.mergedAt !== undefined && (last === undefined || pull.mergedAt > last)
        ? pull.mergedAt
        : last,
    undefined,
  );
}

/**
 * The hold line counts only when the author wrote it after the last merge.
 * One written before it (HAL-17445 had it under every comment) is the
 * author's plan from before the merge, and kept the task and the tasks it
 * blocks open for hours (HAL-17692). More pull requests still to come keep
 * the task open by being open, even as drafts.
 */
function heldAfterMerge(pulls: readonly PullFacts[], memory: Memory): boolean {
  const merged = lastMergeAt(pulls);
  return (
    memory.heldAt !== undefined &&
    (merged === undefined || Date.parse(memory.heldAt) > Date.parse(merged))
  );
}

/** The pull request that merged last, which keys a task's merge markers. */
export function newestMerge(pulls: readonly PullFacts[]): PullFacts | undefined {
  return pulls
    .filter((pull) => pull.mergedAt !== undefined)
    .reduce<PullFacts | undefined>(
      (last, pull) => (last === undefined || `${pull.mergedAt}` > `${last.mergedAt}` ? pull : last),
      undefined,
    );
}

/**
 * A task whose pull requests all landed but which got a comment after the
 * last one merged: someone may have added work that isn't a pull request (a
 * deploy, a check, a follow-up in the same task), so the author decides,
 * woken once for the newest merge.
 */
function commentedSinceMerge(pulls: readonly PullFacts[], memory: Memory): Reason | undefined {
  const newest = newestMerge(pulls);
  if (newest?.mergedAt === undefined || memory.lastCommentAt === undefined) {
    return undefined;
  }
  if (!(Date.parse(memory.lastCommentAt) > Date.parse(newest.mergedAt))) {
    return undefined;
  }
  return {
    pull: newest,
    kind: "merged",
    key: `${newest.repo}#${newest.number} ${short(newest.head)} merged`,
  };
}

/**
 * The pull requests of a parked task that GitHub moved to the default branch
 * (HAL-17869; #5737 sat blocked for 2 hours on 24 Nov because its task was in
 * `backlog`), or whose head merge control holds (HAL-18147): the only states
 * the watcher wakes its holder for.
 */
export function parkedCandidates(pulls: readonly PullFacts[]): Reason[] {
  return candidates(pulls).filter(
    (reason) => reason.kind === "retargeted" || reason.kind === "held",
  );
}

/**
 * Done, unless the author said more is coming after the last merge, a child
 * task is open, or someone commented after the merge. That comment wakes the
 * author once; on a parked task it doesn't, since a wake would pick the task
 * up, and its holder put it aside on purpose (HAL-17897 waits on a live check).
 */
function doneDecision(
  task: WatchedTask,
  closed: Extract<Decision, { kind: "done" }>,
  memory: Memory,
): Decision {
  if (heldAfterMerge(closed.pulls, memory)) {
    return { kind: "skip", why: "its author said more pull requests are coming" };
  }
  if (task.openChildren) {
    return { kind: "skip", why: "it has a child task that isn't done" };
  }
  const reason = commentedSinceMerge(closed.pulls, memory);
  if (reason === undefined) {
    return closed;
  }
  return task.parked === true || memory.reported.has(reason.key)
    ? { kind: "skip", why: "it got comments after its merge; its author decides" }
    : { kind: "wake", reasons: [reason] };
}

/**
 * A parked task: done like any other once its pull requests landed (HAL-18147;
 * a task blocked on a sign-off that has since come stayed open), else a wake
 * only for a retargeted or held pull request.
 */
function parkedDecision(task: WatchedTask, pulls: readonly PullFacts[], memory: Memory): Decision {
  const closed = closedOutcome(pulls);
  if (closed?.kind === "done") {
    return doneDecision(task, closed, memory);
  }
  const reasons = newReasons(parkedCandidates(pulls), memory);
  return reasons.length === 0
    ? { kind: "skip", why: "it is parked; only a retargeted or held pull request wakes it" }
    : { kind: "wake", reasons };
}

/**
 * The states that wake a reviewer who holds the task (HAL-19031): the ones
 * that keep a green, approved pull request out of the queue whoever holds it,
 * a retargeted base (#6183 sat 5 hours while its reviewer held HAL-18625) and
 * a failed required workflow. On a parked task only a retargeted one.
 */
export function reviewerCandidates(task: WatchedTask, pulls: readonly PullFacts[]): Reason[] {
  return candidates(pulls).filter(
    (reason) =>
      reason.kind === "retargeted" || (reason.kind === "required-failed" && task.parked !== true),
  );
}

/** The decision for a task its reviewer holds: a wake once per state and head, or nothing. */
export function reviewerDecision(
  task: WatchedTask,
  pulls: readonly PullFacts[],
  memory: Memory,
): Decision {
  if (task.running) {
    return { kind: "skip", why: "its reviewer is already running on it" };
  }
  const reasons = newReasons(reviewerCandidates(task, pulls), memory);
  return reasons.length === 0
    ? { kind: "skip", why: "its reviewer holds it, with nothing retargeted or failed" }
    : { kind: "wake", reasons };
}

/**
 * The decision for one task. `ownerId` is the agent every one of its pull
 * requests' branches names; when anyone else holds the task (its reviewer),
 * or the branches name different agents, the watcher does nothing. Done
 * also waits for its child tasks and for the author's hold line, and a
 * comment after the last merge turns it into one wake for the author. A
 * parked task is done the same way, but hears only about a retargeted or
 * held pull request.
 */
export function decide(
  task: WatchedTask,
  ownerId: string | undefined,
  pulls: readonly PullFacts[],
  memory: Memory,
): Decision {
  if (ownerId === undefined || task.assigneeAgentId !== ownerId) {
    return { kind: "skip", why: "its branches don't all name the agent that holds it" };
  }
  if (task.running) {
    return { kind: "skip", why: "its author is already running on it" };
  }
  if (task.parked === true) {
    return parkedDecision(task, pulls, memory);
  }
  const closed = closedOutcome(pulls);
  if (closed?.kind === "done") {
    return doneDecision(task, closed, memory);
  }
  if (closed !== undefined) {
    return closed;
  }
  const reasons = newReasons(candidates(pulls), memory);
  return reasons.length === 0 ? { kind: "skip", why: "nothing new" } : { kind: "wake", reasons };
}
