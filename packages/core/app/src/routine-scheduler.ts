import type { RunSummary } from "@halonicjs/events";
import type {
  Clock,
  Coordination,
  RunExecutor,
  StartAgentRequest,
  StartRunRequest,
} from "@halonicjs/ports";
import type { DueRun, PlacedRoutine, TickPolicy } from "@halonicjs/routines";
import type { EventBus } from "./event-bus.ts";
import { lastRunKey, lastTickKey, routineRunId } from "./routine-ids.ts";
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

/** What one tick did. */
export interface RoutineTickResult {
  started: RunSummary[];
  failed: RoutineFailure[];
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
  /** Receives `routines.ticked` after each tick that got as far as asking what is due. */
  events?: EventBus<AppEvents>;
}

/** A new empty result each time, so no caller can change another's. */
const nothing = (): RoutineTickResult => ({ started: [], failed: [] });

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
  private current: Promise<RoutineTickResult> | null = null;
  private disposed = false;

  constructor(options: RoutineSchedulerOptions<Routine, Policy, Run>) {
    this.options = options;
    this.lastTickKey = lastTickKey(options.workspaceId);
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
    const { clock, coordination, due, policy, routines, events } = this.options;
    const now = clock.now();
    const stored = await coordination.read(this.lastTickKey);
    const lastTick = stored === null ? null : new Date(stored);
    if (lastTick !== null && now.getTime() <= lastTick.getTime()) {
      return nothing();
    }
    const result = nothing();
    for (const run of due(await routines(), lastTick, now, policy)) {
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
    // A lost race means another instance ticked further; its value stays.
    await coordination.compareAndSet(this.lastTickKey, stored, now.toISOString());
    events?.emit("routines.ticked", { at: now.toISOString(), ...result });
    return result;
  }

  private async start(run: Run): Promise<RunSummary> {
    const { coordination, executor, startOf, workspaceId } = this.options;
    const runKey = lastRunKey(workspaceId, run.key);
    const stored = await coordination.read(runKey);
    const lastRun = stored === null ? null : new Date(stored);
    const what = startOf(run, lastRun);
    const at = run.at.toISOString();
    const trigger = { type: run.trigger, routineId: run.key, at };
    const runId = routineRunId(workspaceId, run.key, run.at);
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
