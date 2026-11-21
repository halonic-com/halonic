/**
 * The routines state of the routines specs, over a real Durable Object's alarm (see
 * `state-host.ts`). Test code only: never import it from a runtime bundle.
 */

import { RoutinesState } from "../routines-state.ts";
import { SuiteClock } from "./suite-case.ts";

export const minute = 60 * 1000;

/**
 * A routines state over a Durable Object's own alarm, with a clock the test moves. The clock is
 * years ahead, so the alarm it sets never fires by itself: the test calls `alarm()`.
 */
export function newState(storage: DurableObjectStorage, options: { tickLimitMs?: number } = {}) {
  const clock = new SuiteClock();
  const ticks: string[] = [];
  let behaviour: () => Promise<void> = async () => {};
  const backupFailures: unknown[] = [];
  const state = new RoutinesState({
    ...options,
    onBackupFailure: (error) => void backupFailures.push(error),
    alarm: { set: (atMs) => storage.setAlarm(atMs), clear: () => storage.deleteAlarm() },
    clock: () => clock,
    listener: () => ({
      onTick: async (at) => {
        ticks.push(at);
        await behaviour();
      },
    }),
  });
  return {
    state,
    clock,
    alarmAt: () => storage.getAlarm(),
    ticks,
    backupFailures,
    onTick: (change: () => Promise<void>) => {
      behaviour = change;
    },
  };
}
