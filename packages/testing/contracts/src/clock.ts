import type { Clock } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";

/**
 * A clock a suite can move forward. Suites that need time to pass (leases,
 * windows, timers) take one from the adapter's test harness and hand it to
 * the adapter, so the clock is passed in on every runtime.
 */
export interface ControlledClock extends Clock {
  /** Moves the clock forward by `ms` milliseconds. */
  advance(ms: number): void;
}

/** Creates the clock under test. */
export type MakeClock = () => Promise<Clock>;

/** The contract every {@link Clock} adapter passes. */
export function clockContract(name: string, make: MakeClock): void {
  verifies("contracts.clock", () => {
    describe(`Clock contract: ${name}`, () => {
      it("gives a valid time that never goes backwards", async () => {
        const clock = await make();
        const first = clock.now();
        const second = clock.now();
        expect(Number.isNaN(first.getTime())).toBe(false);
        expect(second.getTime()).toBeGreaterThanOrEqual(first.getTime());
      });

      it("gives a new Date on every call, so callers may change it", async () => {
        const clock = await make();
        const first = clock.now();
        const time = first.getTime();
        first.setTime(0);
        const second = clock.now();
        expect(second).not.toBe(first);
        expect(second.getTime()).toBeGreaterThanOrEqual(time);
      });
    });
  });
}
