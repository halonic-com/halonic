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
  /** Open only: GitHub says it can't merge into its base. */
  readonly conflicting: boolean;
  /** Open only, read only when conflicting: it sits in the merge queue. */
  readonly inQueue: boolean;
  /** Open only: the newest review or inline comment made on the current head. */
  readonly latestReview: { readonly id: string; readonly at: string } | undefined;
  /** Merged only: `ci-ok` passed on the merge commit, or a later base-branch commit is green. */
  readonly landed: boolean;
}

/** The task, as far as the watcher cares. */
export interface WatchedTask {
  readonly id: string;
  readonly identifier: string;
  readonly assigneeAgentId: string | null;
  /** A run of its assignee is queued or running, so a wake would add nothing. */
  readonly running: boolean;
}

/** One state the author should hear about. `key` says when it is the same state again. */
export interface Reason {
  readonly pull: PullFacts;
  readonly kind: "ci-red" | "conflict" | "review";
  readonly key: string;
}

/** What the watcher reported on the task before, read back from its own comments. */
export interface Memory {
  readonly reported: ReadonlySet<string>;
  /** The newest of the watcher's last comment and the author's last comment. */
  readonly seenUntil: string | undefined;
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

function short(sha: string): string {
  return sha.slice(0, 7);
}

/**
 * Everything about the open pull requests that may need the author, before
 * the watcher checks whether it already told them. A failed merge group is
 * not here: it belongs to the queue session, which finds the culprit.
 */
export function candidates(pulls: readonly PullFacts[]): Reason[] {
  const found: Reason[] = [];
  for (const pull of pulls.filter((each) => each.state === "open")) {
    const at = `${pull.repo}#${pull.number} ${short(pull.head)}`;
    if (pull.ciOkOnHead === "failure") {
      found.push({ pull, kind: "ci-red", key: `${at} ci-red` });
    }
    if (pull.conflicting && !pull.inQueue) {
      found.push({ pull, kind: "conflict", key: `${at} conflict` });
    }
    if (pull.latestReview !== undefined) {
      found.push({ pull, kind: "review", key: `${at} review ${pull.latestReview.id}` });
    }
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

/**
 * The decision for one task. `ownerId` is the agent the pull requests'
 * branch names; when anyone else holds the task (its reviewer), the watcher
 * does nothing.
 */
export function decide(
  task: WatchedTask,
  ownerId: string | undefined,
  pulls: readonly PullFacts[],
  memory: Memory,
): Decision {
  if (ownerId === undefined || task.assigneeAgentId !== ownerId) {
    return { kind: "skip", why: "its author doesn't hold it" };
  }
  if (task.running) {
    return { kind: "skip", why: "its author is already running on it" };
  }
  const closed = closedOutcome(pulls);
  if (closed !== undefined) {
    return closed;
  }
  const reasons = newReasons(candidates(pulls), memory);
  return reasons.length === 0 ? { kind: "skip", why: "nothing new" } : { kind: "wake", reasons };
}
