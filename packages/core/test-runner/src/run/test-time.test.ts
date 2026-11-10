import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { TestClock, TestScheduler } from "./test-time.ts";

const start = new Date("2026-11-10T09:00:00.000Z");

verifies("test-runner.run-tests", () => {
  describe("TestClock", () => {
    it("stands still until it is moved on", () => {
      const clock = new TestClock(start);

      clock.advance(60_000);

      expect(clock.now().toISOString()).toBe("2026-11-10T09:01:00.000Z");
    });

    it("moves on to a later time, and never back", () => {
      const clock = new TestClock(start);

      clock.advanceTo(Date.parse("2026-11-11T09:00:00.000Z"));
      clock.advanceTo(start.getTime());

      expect(clock.now().toISOString()).toBe("2026-11-11T09:00:00.000Z");
    });
  });

  describe("TestScheduler", () => {
    it("delivers only the timers due on the test clock, earliest first", async () => {
      const clock = new TestClock(start);
      const scheduler = new TestScheduler(clock);
      const delivered: string[] = [];
      scheduler.onTimer = async (timer) => {
        delivered.push(timer.timerId);
      };
      await scheduler.schedule("run", "later", "2026-11-10T09:05:00.000Z");
      await scheduler.schedule("run", "now", "2026-11-10T09:00:00.000Z");
      await scheduler.schedule("run", "gone", "2026-11-10T09:00:00.000Z");
      await scheduler.cancel("run", "gone");

      expect(await scheduler.runDue()).toBe(true);
      expect(delivered).toEqual(["now"]);
      expect((await scheduler.pending("run")).map((timer) => timer.timerId)).toEqual(["later"]);

      clock.advance(5 * 60_000);
      await scheduler.runDue();
      expect(delivered).toEqual(["now", "later"]);
    });

    it("tells when the earliest pending timer is due, due or not", async () => {
      const scheduler = new TestScheduler(new TestClock(start));
      expect(scheduler.nextAt()).toBeUndefined();

      await scheduler.schedule("run", "later", "2026-11-12T09:00:00.000Z");
      await scheduler.schedule("run", "sooner", "2026-11-11T09:00:00.000Z");

      expect(scheduler.nextAt()).toBe(Date.parse("2026-11-11T09:00:00.000Z"));
    });

    it("delivers the due timers a delivery sets, and gives up on one that never stops", async () => {
      const scheduler = new TestScheduler(new TestClock(start));
      let count = 0;
      scheduler.onTimer = async (timer) => {
        count += 1;
        await scheduler.schedule(timer.key, `again-${count}`, timer.at);
      };
      await scheduler.schedule("run", "first", start.toISOString());

      expect(await scheduler.runDue(5)).toBe(false);
      expect(count).toBe(5);
    });
  });
});
