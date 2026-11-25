import type { Clock } from "@halonicjs/ports";
import type { RunStateClient } from "./plugin-run-store.ts";

/**
 * Plugin state in memory that hands out copies, as the host's database
 * does: a caller can't change a stored value through what it read or wrote.
 */
export function copyingState(): RunStateClient & { readonly saved: Map<string, string> } {
  const saved = new Map<string, string>();
  return {
    saved,
    get: async (key) => {
      const value = saved.get(JSON.stringify(key));
      return value === undefined ? null : JSON.parse(value);
    },
    set: async (key, value) => {
      saved.set(JSON.stringify(key), JSON.stringify(value));
    },
    delete: async (key) => {
      saved.delete(JSON.stringify(key));
    },
  };
}

/** A clock the test moves forward, from `start`, as the contracts' `ControlledClock`. */
export function testClock(
  start = "2026-11-25T00:00:00.000Z",
): Clock & { advance(ms: number): void } {
  let at = Date.parse(start);
  return {
    now: () => new Date(at),
    advance: (ms) => {
      at += ms;
    },
  };
}
