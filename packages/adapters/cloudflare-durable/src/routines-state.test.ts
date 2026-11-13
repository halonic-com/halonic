import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { ManualClock } from "./fakes.test-helper.ts";
import { defaultBackupAfterMs, RoutinesState } from "./routines-state.ts";
import type { AlarmSlot } from "./run-state.ts";
import { TimeLimitError } from "./time-limit.ts";

const minute = 60 * 1000;

/** The alarm as a Durable Object keeps it: one time, or none. */
class FakeAlarm implements AlarmSlot {
  at: number | null = null;
  async set(atMs: number): Promise<void> {
    this.at = atMs;
  }
  async clear(): Promise<void> {
    this.at = null;
  }
}

function newState(options: { tickLimitMs?: number } = {}) {
  const clock = new ManualClock();
  const alarm = new FakeAlarm();
  const ticks: string[] = [];
  let behaviour: () => Promise<void> = async () => {};
  const backupFailures: unknown[] = [];
  const state = new RoutinesState({
    ...options,
    onBackupFailure: (error) => void backupFailures.push(error),
    alarm,
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
    alarm,
    ticks,
    backupFailures,
    onTick: (change: () => Promise<void>) => {
      behaviour = change;
    },
  };
}

verifies("cloudflare-durable.routines-tick", () => {
  describe("RoutinesState", () => {
    it("passes the tick to the listener and sets the backup alarm after it", async () => {
      const { state, clock, alarm, ticks } = newState();
      const at = clock.now().toISOString();
      await state.tick(at);
      expect(ticks).toEqual([at]);
      expect(alarm.at).toBe(clock.now().getTime() + defaultBackupAfterMs);
    });

    it("moves the backup alarm on with every tick, so it never fires while the cron runs", async () => {
      const { state, clock, alarm } = newState();
      for (let tick = 0; tick < 5; tick++) {
        clock.advance(minute);
        await state.tick(clock.now().toISOString());
        expect(alarm.at).toBe(clock.now().getTime() + 3 * minute);
      }
    });

    it("lets a tick that arrives during another share it, and ticks again afterwards", async () => {
      const { state, clock, ticks, onTick } = newState();
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
    });

    it("rejects a failed tick to the cron, does not retry it, and still sets the backup alarm", async () => {
      const { state, clock, alarm, ticks, onTick } = newState();
      onTick(async () => {
        throw new Error("the routines are broken");
      });
      await expect(state.tick(clock.now().toISOString())).rejects.toThrow(
        "the routines are broken",
      );
      expect(ticks).toHaveLength(1);
      expect(alarm.at).toBe(clock.now().getTime() + defaultBackupAfterMs);
    });

    it("ticks at the clock's time when the backup alarm fires, and sets it again", async () => {
      const { state, clock, alarm, ticks } = newState();
      await state.tick(clock.now().toISOString());
      clock.advance(3 * minute);
      await state.alarm();
      expect(ticks.at(-1)).toBe(clock.now().toISOString());
      expect(alarm.at).toBe(clock.now().getTime() + 3 * minute);
    });

    it("does not throw a failed backup tick, so Cloudflare does not retry it", async () => {
      const { state, alarm, clock, onTick } = newState();
      onTick(async () => {
        throw new Error("the routines are broken");
      });
      await expect(state.alarm()).resolves.toBeUndefined();
      expect(alarm.at).toBe(clock.now().getTime() + defaultBackupAfterMs);
    });
  });
});

verifies("cloudflare-durable.routines-tick-limits", () => {
  describe("RoutinesState limits", () => {
    it("reports a failed backup tick, so a failing tick doesn't go unseen", async () => {
      const { state, backupFailures, onTick } = newState();
      onTick(async () => {
        throw new Error("the routines are broken");
      });
      await state.alarm();
      expect(backupFailures).toEqual([new Error("the routines are broken")]);
    });

    it("does not report a backup tick that worked", async () => {
      const { state, backupFailures } = newState();
      await state.alarm();
      expect(backupFailures).toEqual([]);
    });

    describe("a tick that never ends", () => {
      it("is given up on after the limit, so later ticks aren't held", async () => {
        const { state, clock, ticks, alarm, onTick } = newState({ tickLimitMs: 20 });
        onTick(() => new Promise<void>(() => {}));
        await expect(state.tick(clock.now().toISOString())).rejects.toThrow(TimeLimitError);
        expect(alarm.at).toBe(clock.now().getTime() + defaultBackupAfterMs);
        onTick(async () => {});
        await state.tick(clock.now().toISOString());
        expect(ticks).toHaveLength(2);
      });

      it("is reported from the backup alarm as a failed tick", async () => {
        const { state, backupFailures, onTick } = newState({ tickLimitMs: 20 });
        onTick(() => new Promise<void>(() => {}));
        await state.alarm();
        expect(backupFailures[0]).toBeInstanceOf(TimeLimitError);
      });
    });
  });
});
