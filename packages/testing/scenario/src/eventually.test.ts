import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { eventually } from "./eventually.ts";

/** A check that throws `failures` times, numbering each error, and then returns `value`. */
function passesAfter<Value>(failures: number, value: Value) {
  let runs = 0;
  return {
    get runs() {
      return runs;
    },
    check: () => {
      runs += 1;
      if (runs <= failures) throw new Error(`not yet (run ${runs})`);
      return value;
    },
  };
}

/** A fake clock whose only way forward is `wait`, which records every step. */
function fakeTime() {
  const steps: number[] = [];
  let now = 0;
  return {
    steps,
    get now() {
      return now;
    },
    wait: (ms: number) => {
      steps.push(ms);
      now += ms;
    },
  };
}

verifies("scenario.eventually", () => {
  describe("a check that passes", () => {
    it("resolves with its value at once, without waiting", async () => {
      const time = fakeTime();
      const result = await eventually(() => "ready", { within: 1000, every: 100, wait: time.wait });
      expect(result).toBe("ready");
      expect(time.steps).toEqual([]);
    });

    it("waits `every` between checks and resolves on the first one that passes", async () => {
      const time = fakeTime();
      const subject = passesAfter(2, { delivered: 1 });
      const result = await eventually(subject.check, {
        within: 5000,
        every: 1000,
        wait: time.wait,
      });
      expect(result).toEqual({ delivered: 1 });
      expect(subject.runs).toBe(3);
      expect(time.steps).toEqual([1000, 1000]);
    });

    it("awaits an async check and an async wait", async () => {
      const steps: number[] = [];
      let ready = false;
      const result = await eventually(
        async () => {
          if (!ready) throw new Error("not ready");
          return "done";
        },
        {
          within: 10,
          every: 5,
          wait: async (ms) => {
            steps.push(ms);
            ready = true;
          },
        },
      );
      expect(result).toBe("done");
      expect(steps).toEqual([5]);
    });

    it("moves a fake world forward until its state is right", async () => {
      const time = fakeTime();
      const result = await eventually(
        () => {
          expect(time.now).toBeGreaterThanOrEqual(2500);
          return time.now;
        },
        { within: 60_000, every: 1000, wait: time.wait },
      );
      expect(result).toBe(3000);
    });

    it("waits on a real timer when no wait is given", async () => {
      vi.useFakeTimers();
      onTestFinished(() => {
        vi.useRealTimers();
      });
      const subject = passesAfter(1, "woke");
      const pending = eventually(subject.check, { within: 50, every: 50 });
      await vi.advanceTimersByTimeAsync(50);
      await expect(pending).resolves.toBe("woke");
      expect(subject.runs).toBe(2);
    });
  });

  describe("a check that never passes", () => {
    it("runs floor(within / every) + 1 checks, then names the intent and keeps the last error", async () => {
      const time = fakeTime();
      const subject = passesAfter(Number.POSITIVE_INFINITY, "never");
      const failure = await eventually(subject.check, {
        intent: "the timer is delivered",
        within: 1000,
        every: 300,
        wait: time.wait,
      }).catch((error: unknown) => error);

      expect(subject.runs).toBe(4);
      expect(time.steps).toEqual([300, 300, 300]);
      expect(failure).toBeInstanceOf(Error);
      const error = failure as Error;
      expect(error.message).toBe(
        "the timer is delivered didn't hold within 1000 ms: 4 checks, 300 ms apart. Last failure: not yet (run 4)",
      );
      expect((error.cause as Error).message).toBe("not yet (run 4)");
    });

    it("checks twice when within equals every", async () => {
      const time = fakeTime();
      const subject = passesAfter(Number.POSITIVE_INFINITY, "never");
      await expect(
        eventually(subject.check, { within: 100, every: 100, wait: time.wait }),
      ).rejects.toThrow("the check didn't hold within 100 ms: 2 checks");
      expect(subject.runs).toBe(2);
    });

    it("reports a thrown value that isn't an Error", async () => {
      const time = fakeTime();
      const rejection = eventually(
        () => {
          throw "still starting";
        },
        { within: 1, every: 1, wait: time.wait },
      );
      await expect(rejection).rejects.toThrow("Last failure: still starting");
    });
  });

  describe("a budget that could loop forever", () => {
    const badBudgets = [
      { within: 1000, every: 0 },
      { within: 1000, every: -5 },
      { within: 1000, every: Number.NaN },
      { within: 100, every: 300 },
      { within: Number.POSITIVE_INFINITY, every: 100 },
    ];

    it.each(badBudgets)("rejects within $within, every $every without checking", async (budget) => {
      const check = vi.fn(() => "never run");
      await expect(eventually(check, budget)).rejects.toBeInstanceOf(RangeError);
      expect(check).not.toHaveBeenCalled();
    });
  });
});
