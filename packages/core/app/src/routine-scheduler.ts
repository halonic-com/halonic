import type { RunSummary } from "@halonicjs/events";
import type {
  Clock,
  Coordination,
  RunExecutor,
  RunStore,
  StartAgentRequest,
  StartRunRequest,
} from "@halonicjs/ports";
import type { DueRun, PlacedRoutine, TickPolicy } from "@halonicjs/routines";
import type { EventBus } from "./event-bus.ts";
import {
  lastRunKey,
  lastTickKey,
  queueKey,
  routineRunId,
  routineRunPrefix,
  utf8Length,
} from "./routine-ids.ts";
import { applyOverlap, type OverlapDecision, type RoutineOverlap } from "./routine-overlap.ts";
import type { AppEvents } from "./workspace-scope.ts";

/**
 * What the scheduler reads of a due run: the routine key, the due time and
 * the kind of trigger. The rest, such as the routine itself, is for `startOf`.
 */
export type ScheduledRun = Pick<DueRun, "key" | "at" | "trigger">;

/**
 * A tick function such as `due` of `@halonicjs/routines`: the runs to start
 * for the time from `lastTick` (exclusive) up to `now` (inclusive), under a
 * catch-up policy for missed ticks. `lastTick` is `null` on the very first
 * tick of a workspace.
 */
export type DueFunction<Routine, Policy, Run extends ScheduledRun> = (
  routines: readonly Routine[],
  lastTick: Date | null,
  now: Date,
  policy: Policy,
) => readonly Run[];

/**
 * How to start a due run: a workflow with its input, or one agent with a
 * prompt. `startOf` fills in the templates (`{{trigger.at}}`); the
 * scheduler adds the run id and the trigger.
 */
export type RoutineStart =
  | { workflow: Omit<StartRunRequest, "runId" | "trigger" | "kind"> }
  | { agent: Omit<StartAgentRequest, "runId" | "trigger"> };

/** A due run that could not be started. */
export interface RoutineFailure {
  key: string;
  /** ISO time the run was due. */
  at: string;
  error: Error;
}

/** A due time of a routine that a tick didn't start. */
export interface RoutineTime {
  key: string;
  /** ISO time the run was due. */
  at: string;
}

/** What one tick did. */
export interface RoutineTickResult {
  started: RunSummary[];
  failed: RoutineFailure[];
  /** Every due time waiting in the queue after the tick (`overlap: queue`), oldest first per routine. */
  queued: RoutineTime[];
  /**
   * Due times dropped because a run of the routine was going
   * (`overlap: skip`), or because its queue was full.
   */
  skipped: RoutineTime[];
}

/**
 * What a {@link RoutineScheduler} works with. The types default to those of
 * `@halonicjs/routines`; tests may pass their own routines and tick function.
 */
export interface RoutineSchedulerOptions<
  Routine = PlacedRoutine,
  Policy = TickPolicy,
  Run extends ScheduledRun = DueRun,
> {
  /**
   * Names the workspace for as long as it exists, and is the same on every
   * host that ticks it: a stable id kept with the workspace, never a path or
   * URL, which usually differs per host (a laptop path and a server path).
   * It goes into the last-tick key and the run ids, so workspaces that share
   * a `Coordination` or a run store (several open in one window, or `serve`)
   * never skip or reuse each other's fires. Two hosts that pass different
   * ids for one workspace start every fire twice.
   */
  workspaceId: string;
  clock: Clock;
  /** Keeps the time of the last tick, shared by every instance of a deployment. */
  coordination: Coordination;
  executor: RunExecutor;
  /**
   * The runs that exist, to tell whether a routine still has a run going
   * (running or waiting) for its overlap rule. Only runs this scheduler
   * started for the workspace count, by their run id.
   */
  runs: Pick<RunStore, "list">;
  /** The routines of the workspace, read fresh on every tick. */
  routines: () => Promise<readonly Routine[]>;
  due: DueFunction<Routine, Policy, Run>;
  policy: Policy;
  /**
   * Turns a due run into what to start, given the due time of the routine's
   * last run that started (`null` if none did). May throw, such as for a
   * routine without a hub.
   */
  startOf: (run: Run, lastRun: Date | null) => RoutineStart;
  /** The overlap rule of a due run's routine. */
  overlapOf: (run: Run) => RoutineOverlap;
  /** Receives `routines.ticked` after each tick that got as far as asking what is due. */
  events?: EventBus<AppEvents>;
}

/** A new empty result each time, so no caller can change another's. */
const nothing = (): RoutineTickResult => ({ started: [], failed: [], queued: [], skipped: [] });

/**
 * Starts the routine runs that are due, on each tick of the `Scheduler`
 * port. It has no timer of its own: the host passes `onTick` to its
 * scheduler, and time comes from the `Clock`.
 *
 * Ticks can be late, repeated, missed or overlap, and two hosts may tick the
 * same workspace. Each due run still starts once:
 * - the last tick time is kept in `Coordination`, per workspace; a tick at or before it does nothing
 * - the tick function catches up on missed ticks under its policy
 * - every run gets {@link routineRunId}, so a start that is repeated (a crash
 *   before the last tick was stored, a second host) returns the existing run
 *
 * While a run of a routine is still going, its next due times follow the
 * routine's overlap rule (see {@link applyOverlap}). Queued times are kept in
 * `Coordination` too, and start on a later tick once the routine is free, if
 * the routine still exists, is enabled and would still run at that time.
 *
 * A run that fails to start is reported and not retried, as in the old
 * `Studio`, so one broken routine never holds the others back. If reading
 * the routines or the tick function throws, the tick rejects before it
 * stores anything, so the next tick catches up.
 *
 * It also keeps, per routine, the due time of the last run it started, and
 * gives it to `startOf` for `{{trigger.lastRun}}`.
 */
export class RoutineScheduler<
  Routine = PlacedRoutine,
  Policy = TickPolicy,
  Run extends ScheduledRun = DueRun,
> {
  private readonly options: RoutineSchedulerOptions<Routine, Policy, Run>;
  private readonly lastTickKey: string;
  private readonly queueKey: string;
  private current: Promise<RoutineTickResult> | null = null;
  private disposed = false;

  constructor(options: RoutineSchedulerOptions<Routine, Policy, Run>) {
    this.options = options;
    this.lastTickKey = lastTickKey(options.workspaceId);
    this.queueKey = queueKey(options.workspaceId);
  }

  /**
   * For `SchedulerListener.onTick`. The tick's own time is not used: a late
   * delivery still works with the clock's time.
   */
  onTick = async (_at: string): Promise<void> => {
    await this.tick();
  };

  /**
   * One check: starts every run that is due since the last tick. Does
   * nothing while another tick of this scheduler runs, or after `dispose`.
   *
   * @returns the runs started and the ones that failed to start
   */
  async tick(): Promise<RoutineTickResult> {
    if (this.current !== null || this.disposed) {
      return nothing();
    }
    const run = this.tickOnce();
    this.current = run;
    try {
      return await run;
    } finally {
      this.current = null;
    }
  }

  /**
   * Stops reacting to ticks, and resolves once a tick in progress has
   * settled, so the executor isn't disposed under it. That tick starts no
   * more runs. If it left due runs unstarted, it doesn't store the last
   * tick, so the next host picks them up; if the dispose came during its
   * last start, every run was started and the last tick is stored as usual.
   */
  async dispose(): Promise<void> {
    this.disposed = true;
    // Its failure was already its caller's to see.
    await this.current?.catch(() => undefined);
  }

  private async tickOnce(): Promise<RoutineTickResult> {
    const { clock, coordination, routines, events } = this.options;
    const now = clock.now();
    const stored = await coordination.read(this.lastTickKey);
    const lastTick = stored === null ? null : new Date(stored);
    if (lastTick !== null && now.getTime() <= lastTick.getTime()) {
      return nothing();
    }
    const storedQueue = await coordination.read(this.queueKey);
    const plan = await this.plan(await routines(), lastTick, now, readQueue(storedQueue));
    const result: RoutineTickResult = {
      started: [],
      failed: [],
      queued: plan.queue.map(timeOf),
      skipped: plan.skip.map(timeOf),
    };
    for (const run of plan.start) {
      if (this.disposed) {
        // Not stored and not sent as `routines.ticked`: the workspace is
        // closing, so start failures from earlier in this tick go unreported.
        return result;
      }
      try {
        result.started.push(await this.start(run));
      } catch (error) {
        const asError = error instanceof Error ? error : new Error(String(error));
        result.failed.push({ key: run.key, at: run.at.toISOString(), error: asError });
      }
    }
    // Stored after the starts: a crash in between repeats them, and the run ids make that harmless.
    // The queue goes first, so a crash before the last tick asks for the same times again and
    // they queue once. A lost race means another instance ticked too; its values stay.
    if (await this.storeQueue(storedQueue, plan.queue)) {
      await coordination.compareAndSet(this.lastTickKey, stored, now.toISOString());
    }
    events?.emit("routines.ticked", { at: now.toISOString(), ...result });
    return result;
  }

  /**
   * Replaces the stored queue with this tick's, unless another instance
   * changed it since the tick read it. Then this tick's queued times are not
   * stored, so it must not store the last tick either: the next tick asks
   * for its times again, and the run ids keep their starts single.
   *
   * @returns whether the queue now holds this tick's times
   */
  private async storeQueue(
    stored: string | null,
    queue: readonly ScheduledRun[],
  ): Promise<boolean> {
    const next = writeQueue(queue);
    if (next === stored) {
      return true;
    }
    return this.options.coordination.compareAndSet(this.queueKey, stored, next);
  }

  /**
   * Which runs to start on this tick, and which to queue or skip: for each
   * routine, its queued runs and then its newly due ones, under its overlap
   * rule. The starts come oldest first, ties by key.
   */
  private async plan(
    routineList: readonly Routine[],
    lastTick: Date | null,
    now: Date,
    queue: ReadonlyMap<string, readonly Date[]>,
  ): Promise<OverlapDecision<Run>> {
    const { due, policy, overlapOf } = this.options;
    const waiting = new Map<string, Run[]>();
    const wait = (run: Run): void => {
      const runs = waiting.get(run.key) ?? [];
      if (!runs.some((other) => other.at.getTime() === run.at.getTime())) {
        runs.push(run);
      }
      waiting.set(run.key, runs);
    };
    for (const [key, times] of queue) {
      for (const at of times) {
        const run = this.requeued(routineList, key, at);
        if (run !== undefined) {
          wait(run);
        }
      }
    }
    for (const run of due(routineList, lastTick, now, policy)) {
      wait(run);
    }
    const plan: OverlapDecision<Run> = { start: [], queue: [], skip: [] };
    if (waiting.size === 0) {
      return plan;
    }
    const going = await this.goingRuns();
    const busy = new Set(going.map((run) => run.trigger?.routineId));
    const goingIds = new Set(going.map((run) => run.id));
    for (const [key, all] of waiting) {
      // A time whose run is already going was started before, by a tick that
      // didn't get to store the last tick; it waits for nothing.
      const runs = all.filter((run) => !goingIds.has(this.runIdOf(run)));
      if (runs.length === 0) {
        continue;
      }
      // Every run in the list is of the same routine, so the first has its rule.
      const decision = applyOverlap(overlapOf(runs[0] as Run), busy.has(key), runs);
      plan.start.push(...decision.start);
      plan.queue.push(...decision.queue);
      plan.skip.push(...decision.skip);
    }
    plan.start.sort(oldestFirst);
    plan.queue.sort(oldestFirst);
    fitQueue(plan);
    return plan;
  }

  /**
   * A queued due time as a run again: what the tick function says is due at
   * exactly that time for that routine. Nothing if the routine was removed,
   * turned off or no longer runs then.
   */
  private requeued(routineList: readonly Routine[], key: string, at: Date): Run | undefined {
    const { due, policy } = this.options;
    const justBefore = new Date(at.getTime() - 1);
    return due(routineList, justBefore, at, policy).find(
      (run) => run.key === key && run.at.getTime() === at.getTime(),
    );
  }

  /** The runs this workspace's scheduler started that are still running or waiting. */
  private async goingRuns(): Promise<RunSummary[]> {
    const { runs, workspaceId } = this.options;
    const prefix = routineRunPrefix(workspaceId);
    const going = await runs.list({ status: ["running", "waiting"] });
    return going.filter((run) => run.id.startsWith(prefix));
  }

  private runIdOf(run: ScheduledRun): string {
    return routineRunId(this.options.workspaceId, run.key, run.at);
  }

  private async start(run: Run): Promise<RunSummary> {
    const { coordination, executor, startOf, workspaceId } = this.options;
    const runKey = lastRunKey(workspaceId, run.key);
    const stored = await coordination.read(runKey);
    const lastRun = stored === null ? null : new Date(stored);
    const what = startOf(run, lastRun);
    const at = run.at.toISOString();
    const trigger = { type: run.trigger, routineId: run.key, at };
    const runId = this.runIdOf(run);
    const summary = await ("workflow" in what
      ? executor.start({ ...what.workflow, trigger, runId })
      : executor.startAgent({ ...what.agent, trigger, runId }));
    // A repeated start (see the class notes) finds its own time stored and
    // fills a different `lastRun`, but the executor returns the run that
    // exists, so the input it started with stays. The time never moves back;
    // a lost race means another host stored it first.
    if (lastRun === null || lastRun.getTime() < run.at.getTime()) {
      await coordination.compareAndSet(runKey, stored, at);
    }
    return summary;
  }
}

/** The most UTF-8 bytes of the stored queue: under the 64 KiB a `Coordination` value may hold. */
const maxQueueBytes = 60_000;

/** The least one queued time adds to the stored queue: an ISO time in quotes, and a comma. */
const minQueuedTimeBytes = 27;

function oldestFirst(a: ScheduledRun, b: ScheduledRun): number {
  return a.at.getTime() - b.at.getTime() || compare(a.key, b.key);
}

function compare(a: string, b: string): number {
  if (a === b) {
    return 0;
  }
  return a < b ? -1 : 1;
}

/**
 * Moves the newest queued runs to the skipped ones until the stored queue
 * fits in a `Coordination` value, so a long queue can never make the ticks
 * fail. Takes a queue sorted oldest first.
 */
function fitQueue<Run extends ScheduledRun>(plan: OverlapDecision<Run>): void {
  let excess = utf8Length(writeQueue(plan.queue) ?? "") - maxQueueBytes;
  while (excess > 0) {
    const dropped = plan.queue.splice(-Math.ceil(excess / minQueuedTimeBytes));
    plan.skip.push(...dropped);
    excess = utf8Length(writeQueue(plan.queue) ?? "") - maxQueueBytes;
  }
}

function timeOf(run: ScheduledRun): RoutineTime {
  return { key: run.key, at: run.at.toISOString() };
}

/**
 * The queue as kept in `Coordination`: JSON of routine key to ISO due times,
 * or `null` when nothing is queued.
 */
function writeQueue(runs: readonly ScheduledRun[]): string | null {
  if (runs.length === 0) {
    return null;
  }
  const queue: Record<string, string[]> = {};
  for (const run of runs) {
    queue[run.key] = [...(queue[run.key] ?? []), run.at.toISOString()];
  }
  return JSON.stringify(queue);
}

/**
 * Reads what {@link writeQueue} wrote. Only this scheduler writes the key,
 * so anything else (a hand edit, a damaged store) counts as no queue rather
 * than stopping every routine of the workspace.
 */
function readQueue(text: string | null): Map<string, Date[]> {
  const queue = new Map<string, Date[]>();
  if (text === null) {
    return queue;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return queue;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return queue;
  }
  for (const [key, times] of Object.entries(parsed)) {
    if (!Array.isArray(times)) {
      continue;
    }
    const dates = times
      .filter((time): time is string => typeof time === "string")
      .map((time) => new Date(time))
      .filter((date) => !Number.isNaN(date.getTime()));
    queue.set(key, dates);
  }
  return queue;
}
