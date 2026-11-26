import { type ConflictFiles, conflictFilesOf } from "./conflict-files.ts";
import {
  branchesOwner,
  candidates,
  closedOutcome,
  type Decision,
  decide,
  type Memory,
  type PullFacts,
  parkedCandidates,
  reviewerCandidates,
  reviewerDecision,
} from "./decide.ts";
import type { FoundPulls, PullRef } from "./discover.ts";
import { type PullFactsReader, pullKey } from "./facts.ts";
import type { ReviewerRoute } from "./handoff.ts";
import { type HeldHead, withHeld } from "./held.ts";
import { emptyMemory, isSelf, readMemory } from "./memory.ts";
import { doneMessage, wakeMessage } from "./messages.ts";
import { postponeUntil } from "./monitors.ts";
import { type Paperclip, type TaskRow, waitingRunStatuses } from "./paperclip.ts";
import type { RebaseOnly } from "./rebase-only.ts";
import { noReroute, rerouteStep } from "./reroute.ts";
import { reviewSteps } from "./review-steps.ts";
import { noReviewWait, noteReviewWait, oldestFirst, type WaitRow } from "./review-wait.ts";
import type { ReviewerLimits } from "./reviewer-limits.ts";
import { type StackRebase, stackStep } from "./stack-rebase.ts";
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
  /** The files a conflicting pull request conflicts in, for the wake comment (HAL-17922); none when unset. */
  readonly conflictFiles?: ConflictFiles;
  /** Rebases a stacked pull request once its base merged (HAL-18031); off when unset. */
  readonly stackRebase?: StackRebase;
  /** The heads merge control holds after a failed merge group (HAL-18147); none when unset. */
  readonly held?: readonly HeldHead[];
  /**
   * Hears each task the watcher decided on from its pull requests, with the
   * facts and memory it decided from, so the signal pass reads the same
   * (HAL-18197); nothing when unset.
   */
  readonly observe?: TaskObserver;
  /** Whether a reviewer is parked or at a limit, by agent id (HAL-19203); without it, no review moves. */
  readonly limits?: ReviewerLimits | undefined;
}

/** Called with what the watcher read about one task its author holds. */
export type TaskObserver = (
  task: TaskRow,
  ownerId: string | undefined,
  pulls: readonly PullFacts[],
  memory: Memory,
) => void;

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
  /** Tasks their reviewer holds, noted for a green head unapproved for over an hour (HAL-17760). */
  readonly reviewWaits: number;
  /** Tasks raised to `high` for a green head unapproved for over an hour (HAL-17920). */
  readonly priorityRaised: number;
  /** Tasks moved from a limited reviewer to the other one (HAL-19203). */
  readonly rerouted: number;
  /** Tasks noted because both reviewers are limited (HAL-19203). */
  readonly bothLimited: number;
  /** Every handed-over head still waiting for its approval, oldest handoff first. */
  readonly longestWaits: readonly WaitRow[];
  readonly failed: readonly string[];
}

/** What every task in one tick shares: agents by short name, found pull requests, their facts. */
interface TickRefs {
  readonly owners: ReadonlyMap<string, string>;
  readonly found: FoundPulls;
  /** The facts of every pull request whose author or reviewer holds its task, or why they couldn't be read. */
  readonly facts: ReadonlyMap<string, PullFacts> | Error;
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

/**
 * The pull requests of a task its reviewer (Liam or Julian, not its author)
 * holds with no run going: read only for the review-wait note (HAL-17760).
 */
function reviewerHeldPulls(
  task: TaskRow,
  found: FoundPulls,
  owners: ReadonlyMap<string, string>,
): readonly PullRef[] {
  const pulls = found.get(task.identifier) ?? [];
  const holder = task.assigneeAgentId;
  const reviewers = [owners.get("liam"), owners.get("julian")];
  const author = ownerOf(
    pulls.map((ref) => ref.branch),
    owners,
  );
  const held = holder !== null && reviewers.includes(holder) && holder !== author;
  return held && !task.running ? pulls : [];
}

/**
 * The same, but a run that is only queued or parked doesn't count: moving a
 * limited reviewer's task cancels it (HAL-19203).
 */
function reroutablePulls(
  task: TaskRow,
  found: FoundPulls,
  owners: ReadonlyMap<string, string>,
): readonly PullRef[] {
  const working = task.running && !waitingRunStatuses.has(task.runStatus ?? "");
  return working ? [] : reviewerHeldPulls({ ...task, running: false }, found, owners);
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
  const wakes = task.parked === true ? parkedCandidates(pulls) : candidates(pulls);
  return wakes.length > 0 || closedOutcome(pulls)?.kind === "done";
}

/** A retargeted or failed-workflow wake for a task its reviewer holds (HAL-19031); undefined for any other task. */
async function reviewerTask(options: TickOptions, task: TaskRow, refs: TickRefs) {
  const pulls = reviewerHeldPulls(task, refs.found, refs.owners).map((ref) =>
    factsOf(ref, refs.facts),
  );
  const holder = task.assigneeAgentId;
  if (pulls.length === 0 || holder === null) {
    return undefined;
  }
  const wakes = reviewerCandidates(task, pulls).length > 0;
  const memory = wakes
    ? readMemory(await options.paperclip.comments(task.id), holder)
    : emptyMemory;
  return reviewerDecision(task, pulls, memory);
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
    const reviewed = await reviewerTask(options, task, refs);
    if (reviewed !== undefined) {
      return reviewed;
    }
    const listedOwner = ownerOf(
      found.map((ref) => ref.branch),
      refs.owners,
    );
    return decide(task, listedOwner, [], emptyMemory);
  }
  const pulls = withHeld(
    found.map((ref) => factsOf(ref, refs.facts)),
    options.held ?? [],
  );
  const ownerId = ownerOf(
    pulls.map((pull) => pull.branch),
    refs.owners,
  );
  const memory =
    ownerId !== undefined && ownerId === task.assigneeAgentId && needsMemory(task, pulls)
      ? readMemory(await options.paperclip.comments(task.id), ownerId)
      : emptyMemory;
  options.observe?.(task, ownerId, pulls, memory);
  return stackStep(options, task, decide(task, ownerId, pulls, memory));
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
      : wakeMessage(
          decision.reasons,
          options.summary,
          await conflictFilesOf(decision.reasons, options.conflictFiles, options.log),
        );
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
          // A held head is the author's to fix now, whatever the task's status (HAL-18147).
          { todo: decision.reasons.some((reason) => reason.kind === "held") },
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

/** The review-wait step for a task its reviewer holds; nothing for any other task. */
function reviewWaitOf(options: TickOptions, task: TaskRow, refs: TickRefs) {
  const pulls = reviewerHeldPulls(task, refs.found, refs.owners).map((ref) =>
    factsOf(ref, refs.facts),
  );
  if (pulls.length === 0) {
    return Promise.resolve(noReviewWait);
  }
  return noteReviewWait(options, task, pulls, async () =>
    (await options.paperclip.comments(task.id)).filter(isSelf),
  );
}

/** The reroute step for a task a limited reviewer holds; nothing for any other task. */
function rerouteOf(options: TickOptions, task: TaskRow, refs: TickRefs) {
  // A parked task waits on something else first; its review isn't due.
  const refsOf = task.parked === true ? [] : reroutablePulls(task, refs.found, refs.owners);
  const pulls = refsOf.map((ref) => factsOf(ref, refs.facts));
  return pulls.length === 0
    ? Promise.resolve(noReroute)
    : rerouteStep({ ...options, owners: refs.owners }, task, pulls);
}

/** What one tick counts, apart from the tasks it couldn't check. */
type Counts = Omit<TickSummary, "failed" | "longestWaits">;

const zero: Counts = {
  checked: 0,
  done: 0,
  woken: 0,
  postponed: 0,
  postponeRefused: 0,
  handedOff: 0,
  warned: 0,
  reviewWaits: 0,
  priorityRaised: 0,
  rerouted: 0,
  bothLimited: 0,
};

function one(yes: boolean): number {
  return yes ? 1 : 0;
}

/** Checks one task and carries out its decision; what it did, as counts, with its review waits added to `waits`. */
async function checkTask(
  options: TickOptions,
  task: TaskRow,
  refs: TickRefs,
  waits: WaitRow[],
): Promise<Counts> {
  const decision = await decideTask(options, task, refs);
  if (decision === undefined) {
    return zero;
  }
  const monitor = await keepMonitorBack(options, task, refs, decision);
  const review =
    decision.kind === "skip"
      ? await reviewStepsOf(options, task, refs)
      : { handedOff: false, warned: false };
  const moved = decision.kind === "skip" ? await rerouteOf(options, task, refs) : noReroute;
  const waited =
    decision.kind === "skip" && !moved.rerouted
      ? await reviewWaitOf(options, task, refs)
      : noReviewWait;
  waits.push(...waited.waits);
  const acted = await act(options, task, decision);
  return {
    checked: 1,
    done: one(acted && decision.kind === "done"),
    woken: one(acted && decision.kind === "wake"),
    postponed: one(monitor === "postponed"),
    postponeRefused: one(monitor === "refused"),
    handedOff: one(review.handedOff),
    warned: one(review.warned),
    reviewWaits: one(waited.noted),
    priorityRaised: one(waited.raised),
    rerouted: one(moved.rerouted),
    bothLimited: one(moved.bothLimited),
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
  const wanted = tasks.flatMap((task) => [
    ...watchedPulls(task, found, owners),
    ...reroutablePulls(task, found, owners),
  ]);
  // One read for every task; if it fails, each of those tasks reports it below.
  const facts = await options.facts(wanted).catch((error: unknown) => error as Error);
  const refs: TickRefs = { owners, found, facts };
  const counts = { ...zero };
  const failed: string[] = [];
  const waits: WaitRow[] = [];
  for (const task of tasks) {
    try {
      const add = await checkTask(options, task, refs, waits);
      for (const key of Object.keys(counts) as (keyof Counts)[]) {
        counts[key] += add[key];
      }
    } catch (error) {
      failed.push(task.identifier);
      options.log(`${task.identifier}: couldn't check it: ${(error as Error).message}`);
    }
  }
  return { ...counts, longestWaits: oldestFirst(waits), failed };
}
