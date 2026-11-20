import { evaluateGuard } from "@halonicjs/workflow";
import { DEFAULT_TICK_POLICY, type PlacedRoutine, routineKey, type TickPolicy } from "./due.ts";
import { MINUTE } from "./time-zone.ts";

/**
 * How far back a tick looks for signals past the last tick, so a signal a run
 * appended while the last tick was reading the runs is not missed. A signal
 * seen by two ticks starts its routine once: the caller derives the run id
 * from the routine and the signal.
 */
export const SIGNAL_OVERLAP_MS = 2 * MINUTE;

/** A signal as a run lists it: `id` is `<runId>:<seq>` of its `signal.sent` event. */
export interface SignalSent {
  id: string;
  name: string;
  data: Record<string, unknown>;
  /** ISO time the signal was sent. */
  at: string;
}

/** The part of a run summary the tick reads: the run's id and the signals it sent. */
export interface RunSignals {
  id: string;
  signals: readonly SignalSent[];
}

/** One run a signal says to start. */
export interface SignalRun {
  /** `<hub>/<routine id>`, or `@workspace/<routine id>` outside a hub. */
  key: string;
  placed: PlacedRoutine;
  /** When the signal was sent. */
  at: Date;
  trigger: "signal";
  signal: { id: string; name: string; data: Record<string, unknown> };
  /** The run that sent the signal: the loop guard follows it back. */
  sentBy: string;
}

/**
 * The runs to start for a tick's signals: for each enabled routine with a
 * signal trigger, every signal of the same name, sent in
 * `(lastTick - SIGNAL_OVERLAP_MS, now]`, that passes the trigger's `when`.
 * `when` reads the signal's data as `trigger.signal` and the time it was sent
 * as `trigger.at`, the way the routine's input and prompt do.
 *
 * Every run's signals count, a `workflow` step's child run included: a signal
 * is the step's, whichever run the step ran in. Signals older than
 * `policy.maxCatchUpAgeMs` (7 days by default) are dropped, as missed times
 * are. `catchUp` doesn't apply: it is about scheduled times, and each signal
 * starts its routine at most once. With no last tick, or when now is not
 * after it, nothing is due. Oldest first, ties by key, then by signal id.
 *
 * @example
 * signalsDue([onPaid], [{ id: "r1", signals: [paid] }], lastTick, now);
 * // [{ key: "@workspace/on-paid", at, trigger: "signal", signal: paid, sentBy: "r1" }]
 */
export function signalsDue(
  routines: readonly PlacedRoutine[],
  runs: readonly RunSignals[],
  lastTick: Date | null,
  now: Date,
  policy: TickPolicy = DEFAULT_TICK_POLICY,
): SignalRun[] {
  if (!lastTick || now <= lastTick) return [];
  const from = Math.max(
    lastTick.getTime() - SIGNAL_OVERLAP_MS,
    now.getTime() - policy.maxCatchUpAgeMs,
  );
  const sent = runs.flatMap((run) =>
    run.signals.flatMap((signal) => {
      const at = new Date(signal.at);
      const inWindow = at.getTime() > from && at <= now;
      return inWindow ? [{ signal, at, sentBy: run.id }] : [];
    }),
  );
  const starts: SignalRun[] = [];
  for (const placed of routines) {
    const { enabled, trigger } = placed.routine;
    if (!enabled || !("signal" in trigger)) continue;
    for (const { signal, at, sentBy } of sent) {
      if (signal.name !== trigger.signal.name) continue;
      const scope = { trigger: { at: at.toISOString(), signal: signal.data } };
      if (trigger.signal.when && !evaluateGuard(trigger.signal.when, scope)) continue;
      const { id, name, data } = signal;
      starts.push({
        key: routineKey(placed),
        placed,
        at,
        trigger: "signal",
        signal: { id, name, data },
        sentBy,
      });
    }
  }
  return starts.sort(
    (a, b) =>
      a.at.getTime() - b.at.getTime() || compare(a.key, b.key) || compare(a.signal.id, b.signal.id),
  );
}

function compare(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}
