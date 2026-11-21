// What the run state tells the watchdog, over a real Durable Object's storage (see `run-state.test.ts`).

import { completed, entered, started } from "@halonicjs/testing-contracts";
import { describe, expect, it } from "vitest";
import { hour, minute, newState } from "./run-state-case.ts";
import { inObjectState } from "./state-host.ts";

export { StateHostObject } from "./state-host.ts";

describe("RunState health", () => {
  it("tells the time of the last event, and none for an empty log", () =>
    inObjectState(async ({ storage }) => {
      const { state } = newState(storage);
      expect(await state.health()).toEqual({ lastEventAt: null, overdueMs: 0, ended: false });
      const events = [started("r1"), entered("r1", 2)];
      await state.append("r1", 0, events);
      expect((await state.health()).lastEventAt).toBe(events[1]?.at);
    }));

  it("tells when the log has ended the run, so the watchdog needn't trust a lagging run list", () =>
    inObjectState(async ({ storage }) => {
      const { state } = newState(storage);
      await state.append("r1", 0, [started("r1"), entered("r1", 2)]);
      expect((await state.health()).ended).toBe(false);
      await state.append("r1", 2, [completed("r1", 3)]);
      expect((await state.health()).ended).toBe(true);
    }));

  it("tells how long the earliest timer has been due, and 0 while none is due", () =>
    inObjectState(async ({ storage }) => {
      const { state, clock, inMs } = newState(storage);
      await state.schedule("r1", "wait", inMs(minute));
      await state.schedule("r1", "later", inMs(hour));
      expect((await state.health()).overdueMs).toBe(0);
      clock.advance(5 * minute);
      expect((await state.health()).overdueMs).toBe(4 * minute);
    }));
});
