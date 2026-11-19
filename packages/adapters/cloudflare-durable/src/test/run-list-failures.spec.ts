// Failed run list updates over a real Durable Object's state (see `run-object.test.ts`): the run
// state reports each one, and the run object writes it to the Worker's log.

import { started } from "@halonicjs/testing-contracts";
import { describe, expect, it } from "vitest";
import { RunObject } from "../run-object.ts";
import { newState, second } from "./run-state-case.ts";
import { inObjectState } from "./state-host.ts";
import { SuiteClock } from "./suite-case.ts";

export { StateHostObject } from "./state-host.ts";

/** A run object whose run list always fails, with the default report. */
class FailingRunListObject extends RunObject {
  readonly clockForTest = new SuiteClock();
  protected override clock = this.clockForTest;
  protected override nap = async () => {};
  protected override runList() {
    return {
      publish: async () => {
        throw new TypeError("D1 is down");
      },
    };
  }
}

/** A run object as a Worker that exports the base class itself runs it: no run list. */
// @ts-expect-error No `runList`, as a Worker that exports the base class itself runs it.
class BaseRunObject extends RunObject {
  protected override clock = new SuiteClock();
}

/**
 * Runs `body` with `console.error` recording its lines instead of printing them. The workerd shim has
 * no spies, so the swap is by hand, and undone however `body` ends.
 */
async function withErrorLog(body: (lines: unknown[][]) => Promise<void>): Promise<void> {
  const lines: unknown[][] = [];
  const original = console.error;
  console.error = (...line: unknown[]) => void lines.push(line);
  try {
    await body(lines);
  } finally {
    console.error = original;
  }
}

describe("RunState failed run list update", () => {
  it("reports each failed try with the run, the attempt and the next try, and keeps the update", () =>
    inObjectState(async ({ storage }) => {
      const { state, clock, published, failures, onPublish } = newState(storage);
      const error = new Error("D1 is down");
      onPublish(async () => {
        throw error;
      });
      await state.append("r1", 0, [started("r1")]);
      await state.alarm();
      clock.advance(second);
      await state.alarm();
      expect(failures).toEqual([
        { runId: "r1", attempt: 1, retryInMs: second, error },
        { runId: "r1", attempt: 2, retryInMs: 2 * second, error },
      ]);
      onPublish(async () => {});
      clock.advance(2 * second);
      await state.alarm();
      expect(published).toEqual([["r1", 1]]);
      expect(failures).toHaveLength(2);
    }));
});

describe("RunObject failed run list update", () => {
  it("writes each failed try to the Worker's log, with the run and the attempt", () =>
    inObjectState((state) =>
      withErrorLog(async (lines) => {
        const object = new FailingRunListObject(state, {});
        await object.append("r1", 0, [started("r1")]);
        await object.alarm();
        object.clockForTest.advance(second);
        await object.alarm();
        expect(lines).toEqual([
          [
            "The run list update of run r1 failed (attempt 1, next try in 1 s). TypeError: D1 is down",
          ],
          [
            "The run list update of run r1 failed (attempt 2, next try in 2 s). TypeError: D1 is down",
          ],
        ]);
        expect(await state.storage.getAlarm()).toBe(
          object.clockForTest.now().getTime() + 2 * second,
        );
      }),
    ));

  it("says the run list is missing on every try when the Worker exports the base class", () =>
    inObjectState((state) =>
      withErrorLog(async (lines) => {
        const object = new BaseRunObject(state, {});
        await object.append("r1", 0, [started("r1")]);
        expect(await object.alarm()).toBeUndefined();
        expect(lines).toHaveLength(1);
        expect(String(lines[0]?.[0])).toMatch(
          /^The run list update of run r1 failed \(attempt 1, next try in 1 s\)\. Error: This RunObject has no run list: the Worker must export a subclass that implements runList\(\)\.$/,
        );
        expect(await state.storage.getAlarm()).not.toBeNull();
      }),
    ));

  it("doesn't compile for a subclass without a run list", () => {
    // @ts-expect-error `runList` is abstract: the Worker can't forget it.
    class NoRunListObject extends RunObject {}
    expect(typeof NoRunListObject).toBe("function");
  });
});
