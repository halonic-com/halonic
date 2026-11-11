import { clampWaitMs } from "@halonicjs/integration-kit";
import type { IntegrationHost } from "@halonicjs/ports";

/** A `wait` for tests, and the pauses it was asked for. */
export interface FakeWait {
  readonly wait: IntegrationHost["wait"];
  /** Each pause, clamped as the real host clamps it, in call order. */
  readonly waits: readonly number[];
}

/**
 * A `wait` that resolves at once and records the clamped pause, so a test
 * can say "waited 2 000 ms" without waiting. Like the real host, it rejects
 * with `signal.reason` when `signal` is already aborted.
 *
 * @example
 * const fake = fakeWait();
 * await fake.wait(Infinity);
 * fake.waits; // [30000]
 */
export function fakeWait(): FakeWait {
  const waits: number[] = [];
  return {
    waits,
    wait: async (ms, signal) => {
      signal?.throwIfAborted();
      waits.push(clampWaitMs(ms));
    },
  };
}
