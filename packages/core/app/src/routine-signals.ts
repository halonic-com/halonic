// The routine scheduler's step that starts routines on the signals runs sent
// (requirement `app.scheduler-starts-signal-routines`), apart from the
// scheduler so that file stays short.

import type { RunSummary } from "@halonicjs/events";
import type { Coordination, RunExecutor, RunStore } from "@halonicjs/ports";
import {
  type PlacedRoutine,
  routineKey,
  SIGNAL_OVERLAP_MS,
  type SignalRun,
  signalLoop,
  signalSender,
  signalsDue,
  type TickPolicy,
} from "@halonicjs/routines";
import { routineRunPrefix, signalRunId, signalsKey } from "./routine-ids.ts";
import { LastRuns } from "./routine-last-runs.ts";
import { applyOverlap } from "./routine-overlap.ts";
import type { RoutineStart } from "./routine-scheduler.ts";
import {
  type QueuedSignal,
  readSignalState,
  type SignalState,
  writeSignalState,
} from "./routine-signal-state.ts";
import { asError, type RoutineTickResult, timeOf } from "./routine-tick-result.ts";
import type { TickSkips } from "./routine-tick-skips.ts";

/** What {@link SignalStarts} works with: the scheduler's own ports. */
export interface SignalStartsOptions {
  workspaceId: string;
  coordination: Coordination;
  executor: RunExecutor;
  /**
   * The workspace's runs, and only its own: the signals are read from them,
   * and the loop guard follows a signal back through them.
   */
  runs: Pick<RunStore, "list" | "get">;
  policy: TickPolicy;
  /** Turns a signal start into what to start, given the routine's last run (`null` if none). */
  startOf: (run: SignalRun, lastRun: Date | null) => RoutineStart | Promise<RoutineStart>;
}

/** A tick's signal starts, as the routine scheduler asks for them: see {@link SignalStarts.tick}. */
export interface SignalTick<Routine> {
  tick(
    routines: readonly Routine[],
    lastTick: Date | null,
    now: Date,
    result: RoutineTickResult,
    skips: TickSkips,
  ): Promise<boolean>;
}

/**
 * Starts the routines that the signals sent since the last tick start, on
 * each tick of the routine scheduler.
 *
 * Each match of `signalsDue` gets {@link signalRunId}, so a signal that two
 * ticks or two hosts see starts the routine once. Before the overlap rule, the
 * loop guard (`signalLoop`) is asked, and refuses when it can't follow the
 * chain or can't read the store; a refused start is a `signal-loop` skip.
 * Then the routine's `overlap` counts every run of the routine that is going,
 * whatever started it: `skip` drops the signal as a `busy` skip, and `queue`
 * keeps it for a later tick. A skipped signal is noted, so the next tick,
 * whose window overlaps this one's, doesn't decide it again.
 */
export class SignalStarts implements SignalTick<PlacedRoutine> {
  private readonly options: SignalStartsOptions;
  private readonly key: string;
  private readonly lastRuns: LastRuns;

  constructor(options: SignalStartsOptions) {
    this.options = options;
    this.key = signalsKey(options.workspaceId);
    this.lastRuns = new LastRuns(options.coordination, options.workspaceId);
  }

  /**
   * One tick's signal starts, added to `result`; skips go into `skips`.
   *
   * @returns whether the tick's queued and skipped signals were stored; if
   *   not, the scheduler doesn't store the last tick either, so the next
   *   tick decides them again
   */
  async tick(
    routines: readonly PlacedRoutine[],
    lastTick: Date | null,
    now: Date,
    result: RoutineTickResult,
    skips: TickSkips,
  ): Promise<boolean> {
    const stored = await this.options.coordination.read(this.key);
    const state = readSignalState(stored);
    const onSignal = routines.filter(
      ({ routine }) => routine.enabled && "signal" in routine.trigger,
    );
    if (onSignal.length === 0 && Object.keys(state.queue).length === 0) {
      return stored === null || this.store(stored, { decided: {}, queue: {} }, result, skips);
    }
    const { runs, policy } = this.options;
    const since = new Date(now.getTime() - policy.maxCatchUpAgeMs).toISOString();
    const recent = await runs.list({ startedSince: since });
    const exists = new Set(recent.map((run) => run.id));
    const waiting = new Map<string, SignalRun[]>();
    const wait = (run: SignalRun): void => {
      const id = this.runIdOf(run);
      if (exists.has(id) || Object.hasOwn(state.decided, id)) return;
      const list = waiting.get(run.key) ?? [];
      if (!list.some((other) => other.signal.id === run.signal.id)) list.push(run);
      waiting.set(run.key, list);
    };
    await this.requeue(onSignal, state.queue, now, wait, skips, new Set(routines.map(routineKey)));
    for (const run of signalsDue(onSignal, recent, lastTick, now, policy)) wait(run);

    const next: SignalState = { decided: keptDecisions(state.decided, now), queue: {} };
    if (waiting.size > 0) await this.decideAll(waiting, next, result, skips);
    return this.store(stored, next, result, skips);
  }

  /**
   * For each routine's waiting signals: the loop guard, then the overlap
   * rule, then the starts. The decisions to keep go into `next`.
   */
  private async decideAll(
    waiting: ReadonlyMap<string, readonly SignalRun[]>,
    next: SignalState,
    result: RoutineTickResult,
    skips: TickSkips,
  ): Promise<void> {
    const going = await this.goingRuns();
    const busy = new Set(going.map((run) => run.trigger?.routineId));
    for (const [key, list] of waiting) {
      const allowed = await this.guard(key, list, next, skips);
      const first = allowed[0];
      if (first === undefined) continue;
      const decision = applyOverlap(first.placed.routine.overlap, busy.has(key), allowed);
      for (const run of decision.skip) this.decide(run, next, skips, "busy", result);
      next.queue[key] = decision.queue.map((run) => ({ id: run.signal.id, at: iso(run.at) }));
      result.queued.push(...decision.queue.map(timeOf));
      for (const run of decision.start) await this.start(run, result, skips);
    }
  }

  /**
   * The queued signals as starts again, each read back from the run that sent
   * it. One whose routine was turned off or changed so the signal no longer
   * starts it, or whose run is gone, is a `changed` skip; a removed routine's go
   * without a trace.
   */
  private async requeue(
    onSignal: readonly PlacedRoutine[],
    queue: Readonly<Record<string, readonly QueuedSignal[]>>,
    now: Date,
    wait: (run: SignalRun) => void,
    skips: TickSkips,
    keys: ReadonlySet<string>,
  ): Promise<void> {
    for (const [key, signals] of Object.entries(queue)) {
      const placed = onSignal.filter((routine) => routineKey(routine) === key);
      for (const queued of signals) {
        const sender = await this.options.runs.get(signalSender(queued.id));
        const signal = sender?.signals.find((one) => one.id === queued.id);
        // A last tick that puts the signal just inside the window.
        const sentAt = new Date(queued.at).getTime();
        const lastTick = new Date(Math.min(sentAt - 1 + SIGNAL_OVERLAP_MS, now.getTime() - 1));
        const sent = sender && signal ? [{ id: sender.id, signals: [signal] }] : [];
        const run = signalsDue(placed, sent, lastTick, now, this.options.policy)[0];
        if (run !== undefined) wait(run);
        else if (keys.has(key)) skips.addTimes([{ key, at: new Date(queued.at) }], "changed");
      }
    }
  }

  /** The starts the loop guard lets through; each refused one is a `signal-loop` skip. */
  private async guard(
    key: string,
    runs: readonly SignalRun[],
    next: SignalState,
    skips: TickSkips,
  ): Promise<SignalRun[]> {
    const read = (runId: string) => this.options.runs.get(runId);
    const allowed: SignalRun[] = [];
    for (const run of runs) {
      // A store that can't be read is a chain the guard can't follow: refused.
      const loop = await signalLoop(key, run.sentBy, read).catch(() => ({ kind: "unknown" }));
      if (loop === null) allowed.push(run);
      else this.decide(run, next, skips, "signal-loop");
    }
    return allowed;
  }

  private decide(
    run: SignalRun,
    next: SignalState,
    skips: TickSkips,
    reason: "busy" | "signal-loop",
    result?: RoutineTickResult,
  ): void {
    next.decided[this.runIdOf(run)] = iso(run.at);
    skips.addTimes([{ key: run.key, at: run.at }], reason);
    result?.skipped.push(timeOf(run));
  }

  private async start(run: SignalRun, result: RoutineTickResult, skips: TickSkips) {
    const { executor, startOf } = this.options;
    const lastRun = await this.lastRuns.read(run.key).catch(() => null);
    try {
      const what = await startOf(run, lastRun?.at ?? null);
      const trigger = {
        type: "signal" as const,
        routineId: run.key,
        at: iso(run.at),
        signalId: run.signal.id,
      };
      const runId = this.runIdOf(run);
      result.started.push(
        "workflow" in what
          ? await executor.start({ ...what.workflow, trigger, runId })
          : await executor.startAgent({ ...what.agent, trigger, runId }),
      );
    } catch (error) {
      result.failed.push({ ...timeOf(run), error: asError(error) });
      skips.addRefused(run, error);
      return;
    }
    if (lastRun === null) return;
    try {
      await this.lastRuns.save(lastRun, run.at);
    } catch (error) {
      result.lastRunNotSaved.push({ ...timeOf(run), error: asError(error) });
    }
  }

  /** Stores the tick's state unless another host changed it since; queued signals that don't fit are `busy` skips. */
  private async store(
    stored: string | null,
    next: SignalState,
    result: RoutineTickResult,
    skips: TickSkips,
  ): Promise<boolean> {
    const { text, dropped } = writeSignalState(next);
    for (const { key, signal } of dropped) {
      skips.addTimes([{ key, at: new Date(signal.at) }], "busy");
      result.skipped.push({ key, at: signal.at });
    }
    if (text === stored) return true;
    return this.options.coordination.compareAndSet(this.key, stored, text);
  }

  /** The runs this workspace's scheduler started that are still running or waiting. */
  private async goingRuns(): Promise<RunSummary[]> {
    const prefix = routineRunPrefix(this.options.workspaceId);
    const going = await this.options.runs.list({ status: ["running", "waiting"] });
    return going.filter((run) => run.id.startsWith(prefix));
  }

  private runIdOf(run: SignalRun): string {
    return signalRunId(this.options.workspaceId, run.key, run.at, run.signal.id);
  }
}

/** The decisions a later tick may still meet: those whose signal is inside the next window. */
function keptDecisions(decided: Readonly<Record<string, string>>, now: Date) {
  const from = now.getTime() - SIGNAL_OVERLAP_MS;
  return Object.fromEntries(
    Object.entries(decided).filter(([, at]) => new Date(at).getTime() > from),
  );
}

function iso(at: Date): string {
  return at.toISOString();
}
