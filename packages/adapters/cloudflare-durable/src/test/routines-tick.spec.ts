// The routines state's ticks and backup alarm over a real Durable Object's alarm (see
// `routines-state.test.ts`).

import { describe, expect, it } from "vitest";
import { defaultBackupAfterMs } from "../routines-state.ts";
import { minute, newState } from "./routines-state-case.ts";
import { inObjectState } from "./state-host.ts";

export { StateHostObject } from "./state-host.ts";

describe("RoutinesState", () => {
  it("passes the tick to the listener and sets the backup alarm after it", () =>
    inObjectState(async ({ storage }) => {
      const { state, clock, alarmAt, ticks } = newState(storage);
      const at = clock.now().toISOString();
      await state.tick(at);
      expect(ticks).toEqual([at]);
      expect(await alarmAt()).toBe(clock.now().getTime() + defaultBackupAfterMs);
    }));

  it("moves the backup alarm on with every tick, so it never fires while the cron runs", () =>
    inObjectState(async ({ storage }) => {
      const { state, clock, alarmAt } = newState(storage);
      for (let tick = 0; tick < 5; tick++) {
        clock.advance(minute);
        await state.tick(clock.now().toISOString());
        expect(await alarmAt()).toBe(clock.now().getTime() + 3 * minute);
      }
    }));

  it("lets a tick that arrives during another share it, and ticks again afterwards", () =>
    inObjectState(async ({ storage }) => {
      const { state, clock, ticks, onTick } = newState(storage);
      let finish: () => void = () => {};
      onTick(() => new Promise<void>((resolve) => (finish = resolve)));
      const first = state.tick(clock.now().toISOString());
      const second = state.tick(new Date(clock.now().getTime() + 1000).toISOString());
      finish();
      await Promise.all([first, second]);
      expect(ticks).toHaveLength(1);
      onTick(async () => {});
      await state.tick(clock.now().toISOString());
      expect(ticks).toHaveLength(2);
    }));

  it("rejects a failed tick to the cron, does not retry it, and still sets the backup alarm", () =>
    inObjectState(async ({ storage }) => {
      const { state, clock, alarmAt, ticks, onTick } = newState(storage);
      onTick(async () => {
        throw new Error("the routines are broken");
      });
      await expect(state.tick(clock.now().toISOString())).rejects.toThrow(
        "the routines are broken",
      );
      expect(ticks).toHaveLength(1);
      expect(await alarmAt()).toBe(clock.now().getTime() + defaultBackupAfterMs);
    }));

  it("ticks at the clock's time when the backup alarm fires, and sets it again", () =>
    inObjectState(async ({ storage }) => {
      const { state, clock, alarmAt, ticks } = newState(storage);
      await state.tick(clock.now().toISOString());
      clock.advance(3 * minute);
      await state.alarm();
      expect(ticks.at(-1)).toBe(clock.now().toISOString());
      expect(await alarmAt()).toBe(clock.now().getTime() + 3 * minute);
    }));

  it("does not throw a failed backup tick, so Cloudflare does not retry it", () =>
    inObjectState(async ({ storage }) => {
      const { state, alarmAt, clock, onTick } = newState(storage);
      onTick(async () => {
        throw new Error("the routines are broken");
      });
      expect(await state.alarm()).toBeUndefined();
      expect(await alarmAt()).toBe(clock.now().getTime() + defaultBackupAfterMs);
    }));
});
