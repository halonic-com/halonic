import type { Coordination } from "@halonicjs/ports";
import type { ControlledClock } from "./clock.ts";

/** What an adapter's test harness gives the coordination suite: the adapter and the clock it reads. */
export interface CoordinationHarness {
  coordination: Coordination;
  clock: ControlledClock;
}

/** Creates an empty coordination adapter under test, with a clock the suite can move. */
export type MakeCoordination = () => Promise<CoordinationHarness>;

/** Numbers every `ttlMs`, `windowMs`, `limit` and `by` must refuse: not a positive safe whole number. */
export const invalidAmounts: readonly number[] = [
  0,
  -1,
  1.5,
  Number.NaN,
  Number.POSITIVE_INFINITY,
  Number.MAX_SAFE_INTEGER + 1,
];

/** Keys every method must refuse: empty, or longer than 256 UTF-8 bytes (129 `é` are 258 bytes). */
export const invalidCoordinationKeys: readonly string[] = ["", "é".repeat(129)];

/** The longest valid key: 256 UTF-8 bytes. */
export const longestCoordinationKey = "é".repeat(128);
