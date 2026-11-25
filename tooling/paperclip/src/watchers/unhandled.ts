import { taskOf } from "../pr-tools/queue-state.ts";
import type { QueueEntry, Snapshot, SnapshotPull, SnapshotRepo } from "../snapshot/shape.ts";

/**
 * The 6-hour escalation (HAL-17938): a problem on a pull request that stays
 * the same, same pull request, same head, same kind, for 6 hours is reported
 * once as UNHANDLED, so Chief routes it and the missing quick fix gets added.
 * It reads only the pass's snapshot. The kinds are Chief's list on HAL-17940.
 * A draft, or a pull request whose task waits on a blocker, is a known wait
 * and never escalates.
 */

/** How long a problem may stay before it is reported. */
export const unhandledAfterMs = 6 * 60 * 60 * 1000;

export type ProblemKind =
  | "ci_red"
  | "conflict"
  | "missing_check"
  | "queue_stall"
  | "stale_approval"
  | "group_red"
  | "runner_wait"
  | "dropped_twice";

/** What each kind means, as the report says it. */
export const problemText: Readonly<Record<ProblemKind, string>> = {
  ci_red: "`ci-ok` red on the head",
  conflict: "conflicts with its base, not in the merge queue",
  missing_check: "a required check has no run on the head",
  queue_stall: "approved and green on the head but not in the merge queue",
  stale_approval: "approved on an older head, not on this one",
  group_red: "its merge group's `ci-ok` is red",
  runner_wait: "its merge group has jobs waiting for a runner",
  dropped_twice: "left the merge queue twice without merging",
};

/** A problem seen in this pass. */
export interface Problem {
  readonly repo: string;
  readonly number: number;
  readonly url: string;
  readonly head: string;
  readonly kind: ProblemKind;
  /** The task its branch names, if any. */
  readonly task: string | undefined;
}

/** What the escalation keeps between passes, per company. */
export interface UnhandledState {
  readonly version: 1;
  /** Since when each open problem is seen, by `problemKey`. */
  readonly open: Readonly<Record<string, string>>;
  /** Open problems already reported, by `problemKey`, with when. */
  readonly reported: Readonly<Record<string, string>>;
  /** Pull requests in the merge queue in the last pass, `owner/name#123`. */
  readonly queued: readonly string[];
  /** How many times each open pull request left the queue without merging. */
  readonly drops: Readonly<Record<string, number>>;
}

export const emptyUnhandled: UnhandledState = {
  version: 1,
  open: {},
  reported: {},
  queued: [],
  drops: {},
};

/** A reported problem, with how long it has been open. */
export interface UnhandledReport extends Problem {
  readonly since: string;
}

export function problemKey(problem: Pick<Problem, "repo" | "number" | "head" | "kind">): string {
  return `${problem.repo}#${problem.number} ${problem.head} ${problem.kind}`;
}

function approvedOn(pull: SnapshotPull, head: string): boolean {
  const open = pull.open;
  return (
    open !== null &&
    [...open.approvals, ...(open.githubApprovals ?? [])].some((approval) =>
      head.startsWith(approval.head),
    )
  );
}

function hasApprovals(pull: SnapshotPull): boolean {
  const open = pull.open;
  return open !== null && open.approvals.length + (open.githubApprovals ?? []).length > 0;
}

/** The kinds a pull request shows on its own, from its facts and its queue entry. */
function kindsOf(
  pull: SnapshotPull,
  entry: QueueEntry | undefined,
  defaultBranch: string,
  drops: number,
): ProblemKind[] {
  const open = pull.open;
  if (open === null) {
    return [];
  }
  const kinds: ProblemKind[] = [];
  const approved = approvedOn(pull, pull.head);
  if (open.ciOk === "failure") kinds.push("ci_red");
  if (open.mergeable === "no" && !open.inQueue) kinds.push("conflict");
  if ((open.missingChecks ?? []).length > 0) kinds.push("missing_check");
  if (
    approved &&
    open.ciOk === "success" &&
    open.mergeable === "yes" &&
    !open.inQueue &&
    pull.base === defaultBranch
  ) {
    kinds.push("queue_stall");
  }
  if (!approved && hasApprovals(pull)) kinds.push("stale_approval");
  if (entry?.groupCiOk === "failure") kinds.push("group_red");
  if ((entry?.jobsWaiting ?? 0) > 0) kinds.push("runner_wait");
  if (drops >= 2 && !open.inQueue) kinds.push("dropped_twice");
  return kinds;
}

/** The state a pass builds, before it is saved. */
interface Building {
  readonly open: Record<string, string>;
  readonly reported: Record<string, string>;
  readonly drops: Record<string, number>;
  readonly queued: string[];
  readonly reports: UnhandledReport[];
}

/** Counts an exit from the merge queue without merging; returns the pull request's count. */
function countDrops(
  prKey: string,
  inQueue: boolean,
  before: UnhandledState,
  building: Building,
): number {
  if (inQueue) {
    building.queued.push(prKey);
  }
  const left = before.queued.includes(prKey) && !inQueue ? 1 : 0;
  const count = (before.drops[prKey] ?? 0) + left;
  if (count > 0) {
    building.drops[prKey] = count;
  }
  return count;
}

/** Keeps a problem's clock, and reports it once it reaches 6 hours. */
function track(problem: Problem, before: UnhandledState, building: Building, now: Date): void {
  const key = problemKey(problem);
  const since = before.open[key] ?? now.toISOString();
  building.open[key] = since;
  const at = before.reported[key];
  if (at !== undefined) {
    building.reported[key] = at;
  } else if (now.getTime() - Date.parse(since) >= unhandledAfterMs) {
    building.reported[key] = now.toISOString();
    building.reports.push({ ...problem, since });
  }
}

/** One repository's open pull requests, into `building`. */
function passRepo(
  read: SnapshotRepo,
  before: UnhandledState,
  waitingTasks: ReadonlySet<string>,
  building: Building,
  now: Date,
): void {
  const { repo, defaultBranch, queue, pulls } = read;
  const entries = new Map(queue.map((entry) => [entry.number, entry]));
  for (const pull of pulls) {
    if (pull.state !== "open" || pull.open === null) {
      continue;
    }
    const drops = countDrops(`${repo}#${pull.number}`, pull.open.inQueue, before, building);
    const task = taskOf(repo, pull);
    // Strangers' forks aren't ours to chase; drafts and blocked tasks are known waits.
    const ours = pull.headRepo?.toLowerCase() === repo.toLowerCase();
    if (!ours || pull.open.draft || (task !== undefined && waitingTasks.has(task))) {
      continue;
    }
    for (const kind of kindsOf(pull, entries.get(pull.number), defaultBranch, drops)) {
      track(
        { repo, number: pull.number, url: pull.url, head: pull.head, kind, task },
        before,
        building,
        now,
      );
    }
  }
}

/** Copies the entries of repositories this snapshot didn't read, so nothing restarts their clock. */
function keepUnread<T>(
  from: Readonly<Record<string, T>>,
  into: Record<string, T>,
  read: ReadonlySet<string>,
): void {
  for (const [key, value] of Object.entries(from)) {
    if (!read.has(repoOfKey(key))) {
      into[key] = value;
    }
  }
}

function repoOfKey(key: string): string {
  return key.slice(0, key.indexOf("#"));
}

/**
 * The problems newly over 6 hours in this pass, and the state to save.
 * `waitingTasks` are tasks blocked with a blocker set: their pull requests
 * are a known wait. A fixed problem, or one on an older head, is forgotten,
 * so it starts over if it comes back.
 */
export function unhandledPass(
  snapshot: Snapshot,
  before: UnhandledState,
  waitingTasks: ReadonlySet<string>,
  now: Date,
): { readonly reports: readonly UnhandledReport[]; readonly state: UnhandledState } {
  const building: Building = { open: {}, reported: {}, drops: {}, queued: [], reports: [] };
  for (const read of snapshot.repos) {
    passRepo(read, before, waitingTasks, building, now);
  }
  const read = new Set(snapshot.repos.map(({ repo }) => repo));
  keepUnread(before.open, building.open, read);
  keepUnread(before.reported, building.reported, read);
  keepUnread(before.drops, building.drops, read);
  building.queued.push(...before.queued.filter((key) => !read.has(repoOfKey(key))));
  const { open, reported, queued, drops, reports } = building;
  return { reports, state: { version: 1, open, reported, queued, drops } };
}

function hoursAndMinutes(since: string, now: Date): string {
  const minutes = Math.floor((now.getTime() - Date.parse(since)) / 60_000);
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

/** The report's comment: every problem newly over 6 hours in this pass. */
export function unhandledText(reports: readonly UnhandledReport[], now: Date): string {
  const lines = reports.map(
    (report) =>
      `- ${report.task ?? "no task"}: [${report.repo}#${report.number}](${report.url}), head \`${report.head.slice(0, 7)}\`: ${problemText[report.kind]}, for ${hoursAndMinutes(report.since, now)}`,
  );
  return [
    `UNHANDLED: ${reports.length === 1 ? "1 problem" : `${reports.length} problems`} open for 6 hours or more on the same head with no fix:`,
    ...lines,
  ].join("\n");
}
