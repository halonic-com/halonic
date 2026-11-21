/**
 * The run state of the run-state specs, over a real Durable Object's storage (see
 * `state-host.ts`). Test code only: never import it from a runtime bundle.
 */

import type { ScheduledTimer } from "@halonicjs/ports";
import { sqlOfStorage } from "../run-sql.ts";
import { type RunListFailure, RunState } from "../run-state.ts";
import { SuiteClock } from "./suite-case.ts";

export const second = 1000;
export const minute = 60 * second;
export const hour = 60 * minute;

/**
 * The rows a statement gave. A spec can't call `.toArray()` itself: the check of the vitest shim
 * takes any `.toX(` in a spec for a matcher.
 */
export function rowsOf<T>(result: { toArray(): T[] }): T[] {
  return result.toArray();
}

/**
 * A run state over a Durable Object's own storage and alarm, with a clock the test moves. The
 * clock is years ahead, so the alarm it sets never fires by itself: the test calls `alarm()`.
 */
export function newState(
  storage: DurableObjectStorage,
  options: { nap?: (ms: number, signal: AbortSignal) => Promise<void> } = {},
) {
  const published: [string, number][] = [];
  let publishing: (summaryId: string) => Promise<void> = async () => {};
  const clock = new SuiteClock();
  const delivered: ScheduledTimer[] = [];
  const failures: RunListFailure[] = [];
  let behaviour: () => Promise<void> = async () => {};
  const state = new RunState({
    sql: sqlOfStorage(storage),
    alarm: { set: (atMs) => storage.setAlarm(atMs), clear: () => storage.deleteAlarm() },
    clock: () => clock,
    nap: options.nap ?? (async () => {}),
    listener: () => ({
      onTimer: async (timer) => {
        delivered.push(timer);
        await behaviour();
      },
    }),
    runList: () => ({
      publish: async (summary, seq) => {
        await publishing(summary.id);
        published.push([summary.id, seq]);
      },
    }),
    onRunListFailure: (failure) => failures.push(failure),
  });
  const inMs = (ms: number) => new Date(clock.now().getTime() + ms).toISOString();
  return {
    state,
    clock,
    alarmAt: () => storage.getAlarm(),
    delivered,
    inMs,
    published,
    failures,
    onDelivery: (change: () => Promise<void>) => {
      behaviour = change;
    },
    onPublish: (change: (summaryId: string) => Promise<void>) => {
      publishing = change;
    },
  };
}
