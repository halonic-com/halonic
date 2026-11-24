import {
  branchesOwner,
  candidates,
  closedOutcome,
  type Decision,
  decide,
  type Memory,
  marker,
  type PullFacts,
  parkedCandidates,
  type Reason,
} from "./decide.ts";
import type { FoundPulls, PullRef } from "./discover.ts";
import { type PullFactsReader, pullKey } from "./facts.ts";
import type { ReviewerRoute } from "./handoff.ts";
import { postponeUntil } from "./monitors.ts";
import type { CommentRow, Paperclip, TaskRow } from "./paperclip.ts";
import type { RebaseOnly } from "./rebase-only.ts";
import { reviewSteps } from "./review-steps.ts";
import type { PullSummary } from "./wake-status.ts";

/**
 * What one tick needs. `discover` finds each task's pull requests by branch;
 * `facts` reads them, once for all the tasks whose author holds them.
 */
export interface TickOptions {
  readonly paperclip: Paperclip;
  readonly discover: () => Promise<FoundPulls>;
  readonly facts: PullFactsReader;
  /** Print what it would do, write nothing. */
  readonly dryRun: boolean;
  readonly log: (line: string) => void;
  /** When the pass started: monitors are moved relative to it. */
  readonly now: Date;
  /** What `pr_status` would say about a pull request, for the wake comment; none when unset. */
  readonly summary?: PullSummary;
  /** The reviewer by the path rules, to hand a ready task to; without it, no task goes to review. */
  readonly route?: ReviewerRoute;
  /** Whether only a rebase changed a pull request since its approval (HAL-17759); without it, never. */
  readonly rebaseOnly?: RebaseOnly;
}

/** How a tick went: counts, and the tasks it couldn't check. */
export interface TickSummary {
  readonly checked: number;
  readonly done: number;
  readonly woken: number;
  /** Fallback monitors moved later, so they didn't fire a model run. */
  readonly postponed: number;
  /** Monitors Paperclip refused to move; the log says why. */
  readonly postponeRefused: number;
  /** Tasks handed to their reviewer (HAL-17675). */
  readonly handedOff: number;
  /** Tasks warned about a push after an approval. */
  readonly warned: number;
  readonly failed: readonly string[];
}

/** What every task in one tick shares: agents by short name, found pull requests, their facts. */
interface TickRefs {
  readonly owners: ReadonlyMap<string, string>;
  readonly found: FoundPulls;
  /** The facts of every pull request whose author holds its task, or why they couldn't be read. */
  readonly facts: ReadonlyMap<string, PullFacts> | Error;
}

const emptyMemory: Memory = {
  reported: new Set<string>(),
  seenUntil: undefined,
  heldAt: undefined,
  lastCommentAt: undefined,
};

const markerPattern = /<!-- pr-watcher: (.+?) -->/g;

/** The line an author puts in a task comment to keep the task open after a merge. */
const holdPattern = /^[ \t]*PR watcher: more PRs to come[ \t.]*$/im;

/** The line an author of a security or release pull request puts in a task comment: its review has a task of its own. */
const ownReviewPattern = /^[ \t]*PR watcher: own review task[ \t.]*$/im;

/**
 * A comment the watcher wrote. The host stores no plugin id on a plugin's
 * comment, so it is one with neither an agent nor a user as author that
 * starts with the watcher's name.
 */
export function isSelf(comment: CommentRow): boolean {
  return (
    comment.authorAgentId === null &&
    comment.authorUserId === null &&
    comment.body.startsWith("PR watcher:")
  );
}

/** When the newest of these comments was written. */
function newestAt(comments: readonly CommentRow[]): string | undefined {
  return comments.reduce<string | undefined>(
    (newest, comment) =>
      newest === undefined || comment.createdAt > newest ? comment.createdAt : newest,
    undefined,
  );
}

/** What the watcher reported before, from its own comments and the author's. */
export function readMemory(comments: readonly CommentRow[], ownerId: string): Memory {
  const reported = new Set<string>();
  let seenUntil: string | undefined;
  for (const comment of comments) {
    const self = isSelf(comment);
    if (self) {
      for (const match of comment.body.matchAll(markerPattern)) {
        reported.add(match[1] ?? "");
      }
    }
    const counts = self || comment.authorAgentId === ownerId;
    if (counts && (seenUntil === undefined || comment.createdAt > seenUntil)) {
      seenUntil = comment.createdAt;
    }
  }
  const authorLast = comments
    .filter((comment) => comment.authorAgentId === ownerId)
    .reduce<CommentRow | undefined>(
      (newest, comment) =>
        newest === undefined || comment.createdAt > newest.createdAt ? comment : newest,
      undefined,
    );
  return {
    reported,
    seenUntil,
    heldAt: holdPattern.test(authorLast?.body ?? "") ? authorLast?.createdAt : undefined,
    ownReview: ownReviewPattern.test(authorLast?.body ?? ""),
    lastCommentAt: newestAt(comments.filter((comment) => !isSelf(comment))),
  };
}

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
 * The comment that wakes the author: one line per new state, then each pull
 * request's status from the same pass, then the markers.
 */
export function wakeMessage(reasons: readonly Reason[], summary?: PullSummary): string {
  const lines = reasons.map(
    ({ pull, kind }) =>
      `- [#${pull.number}](${pull.url}): ${reasonText[kind](pull.head.slice(0, 7))}`,
  );
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

/** The agent every branch names, by its id, when there is one and Paperclip knows it. */
function ownerOf(branches: readonly string[], owners: ReadonlyMap<string, string>) {
  const key = branchesOwner(branches);
  return key === undefined ? undefined : owners.get(key);
}

/** The pull requests of a task whose author holds it and isn't running: the ones worth reading. */
function watchedPulls(
  task: TaskRow,
  found: FoundPulls,
  owners: ReadonlyMap<string, string>,
): readonly PullRef[] {
  const pulls = found.get(task.identifier) ?? [];
  // Checked on the branch names first, so a task the reviewer holds costs no GitHub reads.
  const owner = ownerOf(
    pulls.map((ref) => ref.branch),
    owners,
  );
  return owner !== undefined && owner === task.assigneeAgentId && !task.running ? pulls : [];
}

function factsOf(ref: PullRef, facts: TickRefs["facts"]): PullFacts {
  if (facts instanceof Error) {
    throw facts;
  }
  const found = facts.get(pullKey(ref));
  if (found === undefined) {
    throw new Error(`${pullKey(ref)} wasn't read.`);
  }
  return found;
}

/** Whether a decision on the task depends on its comments: a wake, or a done the author may hold. */
function needsMemory(task: TaskRow, pulls: readonly PullFacts[]): boolean {
  if (task.parked === true) {
    return parkedCandidates(pulls).length > 0;
  }
  return candidates(pulls).length > 0 || closedOutcome(pulls)?.kind === "done";
}

async function decideTask(
  options: TickOptions,
  task: TaskRow,
  refs: TickRefs,
): Promise<Decision | undefined> {
  const found = refs.found.get(task.identifier) ?? [];
  if (found.length === 0) {
    return undefined;
  }
  if (watchedPulls(task, refs.found, refs.owners).length === 0) {
    const listedOwner = ownerOf(
      found.map((ref) => ref.branch),
      refs.owners,
    );
    return decide(task, listedOwner, [], emptyMemory);
  }
  const pulls = found.map((ref) => factsOf(ref, refs.facts));
  const ownerId = ownerOf(
    pulls.map((pull) => pull.branch),
    refs.owners,
  );
  const memory =
    ownerId !== undefined && ownerId === task.assigneeAgentId && needsMemory(task, pulls)
      ? readMemory(await options.paperclip.comments(task.id), ownerId)
      : emptyMemory;
  return decide(task, ownerId, pulls, memory);
}

/** Carries out a decision; false when it did nothing (a skip, or the task closed meanwhile). */
async function act(options: TickOptions, task: TaskRow, decision: Decision): Promise<boolean> {
  if (decision.kind === "skip") {
    options.log(`${task.identifier}: nothing to do (${decision.why})`);
    return false;
  }
  const body =
    decision.kind === "done"
      ? doneMessage(decision.pulls)
      : wakeMessage(decision.reasons, options.summary);
  options.log(`${task.identifier}: ${decision.kind}${options.dryRun ? " (dry run)" : ""}\n${body}`);
  if (options.dryRun) {
    return true;
  }
  const outcome =
    decision.kind === "done"
      ? await options.paperclip.markDone(task.id, body)
      : await options.paperclip.wake(
          task.id,
          body,
          decision.reasons.map((reason) => reason.key).join(" | "),
        );
  if (outcome === "closed") {
    options.log(`${task.identifier}: closed during this pass, so left alone`);
    return false;
  }
  return true;
}

/**
 * Moves the fallback monitor of a task the watcher watches 6 hours out, so it
 * doesn't fire a model run while the watcher keeps checking (HAL-16401 part 3).
 * Only while one of its pull requests is open: once they are all closed, the
 * task is done or waits on its author. A refusal is logged and counted; it
 * doesn't fail the task, since its pull requests were still checked.
 */
async function keepMonitorBack(
  options: TickOptions,
  task: TaskRow,
  refs: TickRefs,
  decision: Decision,
): Promise<"postponed" | "refused" | undefined> {
  const until = postponeUntil(task.monitorNextCheckAt, options.now);
  // A parked task's monitor is its holder's own plan for when to pick it up.
  if (decision.kind === "done" || until === undefined || task.parked === true) {
    return undefined;
  }
  const pulls = watchedPulls(task, refs.found, refs.owners).map((ref) => factsOf(ref, refs.facts));
  if (!pulls.some((pull) => pull.state === "open")) {
    return undefined;
  }
  if (options.dryRun) {
    options.log(`${task.identifier}: would move its monitor to ${until} (dry run)`);
    return "postponed";
  }
  try {
    if ((await options.paperclip.postponeMonitor(task.id, until)) === "unchanged") {
      return undefined;
    }
    options.log(`${task.identifier}: moved its monitor to ${until}`);
    return "postponed";
  } catch (error) {
    options.log(`${task.identifier}: couldn't move its monitor: ${(error as Error).message}`);
    return "refused";
  }
}

/**
 * The review steps for a task the watcher had nothing else to say about:
 * only one its author holds with no run going, so a handoff never cancels
 * the author's own run.
 */
function reviewStepsOf(options: TickOptions, task: TaskRow, refs: TickRefs) {
  const pulls = watchedPulls(task, refs.found, refs.owners).map((ref) => factsOf(ref, refs.facts));
  const ownerId = task.assigneeAgentId;
  // A parked task isn't ready for review: its holder picks it up first.
  if (pulls.length === 0 || ownerId === null || task.parked === true) {
    return Promise.resolve({ handedOff: false, warned: false });
  }
  return reviewSteps(
    { ...options, route: options.route, rebaseOnly: options.rebaseOnly, owners: refs.owners },
    task,
    pulls,
    async () => readMemory(await options.paperclip.comments(task.id), ownerId),
  );
}

/** What one tick counts, apart from the tasks it couldn't check. */
type Counts = Omit<TickSummary, "failed">;

const zero: Counts = {
  checked: 0,
  done: 0,
  woken: 0,
  postponed: 0,
  postponeRefused: 0,
  handedOff: 0,
  warned: 0,
};

function one(yes: boolean): number {
  return yes ? 1 : 0;
}

/** Checks one task and carries out its decision; what it did, as counts. */
async function checkTask(options: TickOptions, task: TaskRow, refs: TickRefs): Promise<Counts> {
  const decision = await decideTask(options, task, refs);
  if (decision === undefined) {
    return zero;
  }
  const monitor = await keepMonitorBack(options, task, refs, decision);
  const review =
    decision.kind === "skip"
      ? await reviewStepsOf(options, task, refs)
      : { handedOff: false, warned: false };
  const acted = await act(options, task, decision);
  return {
    checked: 1,
    done: one(acted && decision.kind === "done"),
    woken: one(acted && decision.kind === "wake"),
    postponed: one(monitor === "postponed"),
    postponeRefused: one(monitor === "refused"),
    handedOff: one(review.handedOff),
    warned: one(review.warned),
  };
}

/**
 * One pass over every open task whose identifier a pull request's branch
 * names. A task that fails to read is reported and skipped, so one broken
 * pull request doesn't stop the others.
 */
export async function tick(options: TickOptions): Promise<TickSummary> {
  const owners = new Map(
    (await options.paperclip.agents()).map((agent) => [agent.urlKey, agent.id]),
  );
  const found = await options.discover();
  const tasks = await options.paperclip.openTasks();
  const wanted = tasks.flatMap((task) => watchedPulls(task, found, owners));
  // One read for every task; if it fails, each of those tasks reports it below.
  const facts = await options.facts(wanted).catch((error: unknown) => error as Error);
  const refs: TickRefs = { owners, found, facts };
  const counts = { ...zero };
  const failed: string[] = [];
  for (const task of tasks) {
    try {
      const add = await checkTask(options, task, refs);
      for (const key of Object.keys(counts) as (keyof Counts)[]) {
        counts[key] += add[key];
      }
    } catch (error) {
      failed.push(task.identifier);
      options.log(`${task.identifier}: couldn't check it: ${(error as Error).message}`);
    }
  }
  return { ...counts, failed };
}
