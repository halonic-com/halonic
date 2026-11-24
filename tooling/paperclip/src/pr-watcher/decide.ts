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
  /** Open only: the newest review or inline comment made on the current head. */
  readonly latestReview: { readonly id: string; readonly at: string } | undefined;
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
}

/** One state the author should hear about. `key` says when it is the same state again. */
export interface Reason {
  readonly pull: PullFacts;
  readonly kind: "ci-red" | "conflict" | "retargeted" | "review" | "approved" | "merged";
  readonly key: string;
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
 * not here: it belongs to the queue session, which finds the culprit.
 */
export function candidates(pulls: readonly PullFacts[]): Reason[] {
  const found: Reason[] = [];
  for (const pull of pulls.filter((each) => each.state === "open")) {
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
    if (pull.latestReview !== undefined) {
      found.push({ pull, kind: "review", key: `${at} review ${pull.latestReview.id}` });
    }
    // Nobody queues on such a repository: whoever holds the task merges it.
    if (pull.githubApproval !== undefined && !pull.draft && !pull.inQueue) {
      found.push({ pull, kind: "approved", key: `${at} approved on GitHub` });
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

/**
 * A task whose pull requests all landed but which got a comment after the
 * last one merged: someone may have added work that isn't a pull request (a
 * deploy, a check, a follow-up in the same task), so the author decides,
 * woken once for the newest merge.
 */
function commentedSinceMerge(pulls: readonly PullFacts[], memory: Memory): Reason | undefined {
  const newest = pulls
    .filter((pull) => pull.mergedAt !== undefined)
    .reduce<PullFacts | undefined>(
      (last, pull) => (last === undefined || `${pull.mergedAt}` > `${last.mergedAt}` ? pull : last),
      undefined,
    );
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
 * The decision for one task. `ownerId` is the agent every one of its pull
 * requests' branches names; when anyone else holds the task (its reviewer),
 * or the branches name different agents, the watcher does nothing. Done
 * also waits for its child tasks and for the author's hold line, and a
 * comment after the last merge turns it into one wake for the author.
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
  const closed = closedOutcome(pulls);
  if (closed?.kind === "done" && heldAfterMerge(closed.pulls, memory)) {
    return { kind: "skip", why: "its author said more pull requests are coming" };
  }
  if (closed?.kind === "done" && task.openChildren) {
    return { kind: "skip", why: "it has a child task that isn't done" };
  }
  if (closed?.kind === "done") {
    const reason = commentedSinceMerge(closed.pulls, memory);
    if (reason === undefined) {
      return closed;
    }
    return memory.reported.has(reason.key)
      ? { kind: "skip", why: "it got comments after its merge; its author decides" }
      : { kind: "wake", reasons: [reason] };
  }
  if (closed !== undefined) {
    return closed;
  }
  const reasons = newReasons(candidates(pulls), memory);
  return reasons.length === 0 ? { kind: "skip", why: "nothing new" } : { kind: "wake", reasons };
}
