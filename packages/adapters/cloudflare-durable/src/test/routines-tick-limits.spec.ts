// What the routines state reports and gives up on, over a real Durable Object's alarm (see
// `routines-state.test.ts`).

import { describe, expect, it } from "vitest";
import { defaultBackupAfterMs } from "../routines-state.ts";
import { TimeLimitError } from "../time-limit.ts";
import { newState } from "./routines-state-case.ts";
import { inObjectState } from "./state-host.ts";

export { StateHostObject } from "./state-host.ts";

describe("RoutinesState limits", () => {
  it("reports a failed backup tick, so a failing tick doesn't go unseen", () =>
    inObjectState(async ({ storage }) => {
      const { state, backupFailures, onTick } = newState(storage);
      onTick(async () => {
        throw new Error("the routines are broken");
      });
      await state.alarm();
      expect(backupFailures).toEqual([new Error("the routines are broken")]);
    }));

  it("does not report a backup tick that worked", () =>
    inObjectState(async ({ storage }) => {
      const { state, backupFailures } = newState(storage);
      await state.alarm();
      expect(backupFailures).toEqual([]);
    }));

  describe("a tick that never ends", () => {
    it("is given up on after the limit, so later ticks aren't held", () =>
      inObjectState(async ({ storage }) => {
        const { state, clock, ticks, alarmAt, onTick } = newState(storage, { tickLimitMs: 20 });
        onTick(() => new Promise<void>(() => {}));
        await expect(state.tick(clock.now().toISOString())).rejects.toThrow(TimeLimitError);
        expect(await alarmAt()).toBe(clock.now().getTime() + defaultBackupAfterMs);
        onTick(async () => {});
        await state.tick(clock.now().toISOString());
        expect(ticks).toHaveLength(2);
      }));

    it("is reported from the backup alarm as a failed tick", () =>
      inObjectState(async ({ storage }) => {
        const { state, backupFailures, onTick } = newState(storage, { tickLimitMs: 20 });
        onTick(() => new Promise<void>(() => {}));
        await state.alarm();
        expect(backupFailures[0]).toBeInstanceOf(TimeLimitError);
      }));
  });
});
