import type { ScheduledTimer, SchedulerListener } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { ManualClock } from "./fakes.test-helper.ts";
import { NodeRunSql } from "./node/node-sql.spec.ts";
import { napFor, TimerDelivery } from "./timer-delivery.ts";
import { TimerTable } from "./timer-table.ts";

const second = 1000;

/** A listener that records what it is given and does what the test says. */
class TestListener implements SchedulerListener {
  readonly delivered: ScheduledTimer[] = [];
  behaviour: (timer: ScheduledTimer) => Promise<void> = async () => {};

  async onTimer(timer: ScheduledTimer): Promise<void> {
    this.delivered.push(timer);
    await this.behaviour(timer);
  }

  async onTick(): Promise<void> {}
}

/** The loop's naps end when the test moves its clock, as a real wait ends when time passes. */
class TestWorld {
  readonly clock = new ManualClock();
  readonly listener = new TestListener();
  readonly table = new TimerTable(new NodeRunSql());
  readonly naps: { ms: number; wake: () => void }[] = [];
  readonly delivery = new TimerDelivery({
    table: this.table,
    listener: this.listener,
    clock: this.clock,
    nap: (ms, signal) =>
      new Promise<void>((resolve) => {
        this.naps.push({ ms, wake: resolve });
        signal.addEventListener("abort", () => resolve());
      }),
  });

  inMs(ms: number): string {
    return new Date(this.clock.now().getTime() + ms).toISOString();
  }

  /** Moves the clock and wakes the loop that is napping. */
  advance(ms: number): void {
    this.clock.advance(ms);
    for (const nap of this.naps.splice(0)) nap.wake();
  }
}

verifies("cloudflare-durable.timers", () => {
  describe("TimerDelivery", () => {
    it("delivers a timer that is due, once, with the time it was set for", async () => {
      const world = new TestWorld();
      const at = world.inMs(-second);
      world.table.set("run_1", "wait", at);
      await world.delivery.deliverDueTimers();
      expect(world.listener.delivered).toEqual([{ key: "run_1", timerId: "wait", at }]);
      expect(world.table.pending("run_1")).toEqual([]);
    });

    it("leaves a timer that isn't due", async () => {
      const world = new TestWorld();
      world.table.set("run_1", "wait", world.inMs(5 * second));
      await world.delivery.deliverDueTimers();
      expect(world.listener.delivered).toEqual([]);
      expect(world.table.pending("run_1")).toHaveLength(1);
    });

    it("keeps a rejected timer and delivers it again after its wait", async () => {
      const world = new TestWorld();
      world.listener.behaviour = async () => {
        throw new Error("listener failed");
      };
      world.table.set("run_1", "step", world.inMs(0));
      await world.delivery.deliverDueTimers();
      expect(world.listener.delivered).toHaveLength(1);
      world.clock.advance(second - 1);
      await world.delivery.deliverDueTimers();
      expect(world.listener.delivered).toHaveLength(1);
      world.clock.advance(1);
      await world.delivery.deliverDueTimers();
      expect(world.listener.delivered).toHaveLength(2);
      expect(world.table.pending("run_1")).toHaveLength(1);
    });

    it("delivers a timer that comes due while another timer's call is still running", async () => {
      const world = new TestWorld();
      const release = Promise.withResolvers<void>();
      world.listener.behaviour = async (timer) => {
        if (timer.timerId === "harness-call") await release.promise;
      };
      world.table.set("run_1", "harness-call", world.inMs(0));
      world.table.set("run_1", "start-limit", world.inMs(30 * second));
      const running = world.delivery.deliverDueTimers();
      await expectIds(world, ["harness-call"]);
      world.advance(30 * second);
      await expectIds(world, ["harness-call", "start-limit"]);
      release.resolve();
      await running;
      expect(world.table.pending("run_1")).toEqual([]);
    });

    it("does not start a timer's call again while it is still running", async () => {
      const world = new TestWorld();
      const release = Promise.withResolvers<void>();
      world.listener.behaviour = () => release.promise;
      world.table.set("run_1", "slow", world.inMs(0));
      const running = world.delivery.deliverDueTimers();
      await expectIds(world, ["slow"]);
      world.advance(second);
      await Promise.resolve();
      expect(world.listener.delivered).toHaveLength(1);
      release.resolve();
      await running;
    });
  });

  describe("napFor", () => {
    it("resolves when the time has passed, and at once when it is aborted", async () => {
      const abort = new AbortController();
      await expect(napFor(1, abort.signal)).resolves.toBeUndefined();
      const waiting = napFor(60_000, abort.signal);
      abort.abort();
      await expect(waiting).resolves.toBeUndefined();
    });
  });
});

/** Waits until the listener has been called for exactly these timers, in order. */
async function expectIds(world: TestWorld, timerIds: string[]): Promise<void> {
  for (let tries = 0; tries < 100; tries += 1) {
    const ids = world.listener.delivered.map((timer) => timer.timerId);
    if (ids.length >= timerIds.length) return expect(ids).toEqual(timerIds);
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  expect(world.listener.delivered.map((timer) => timer.timerId)).toEqual(timerIds);
}
