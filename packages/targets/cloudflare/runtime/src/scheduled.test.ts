import type { Watchdog, WatchdogReport } from "@halonicjs/adapter-cloudflare-durable";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { runScheduled } from "./scheduled.ts";

const at = "2026-11-13T12:00:00.000Z";

/** A runtime whose tick and sweep record that they ran, and fail when asked to. */
function fakeRuntime(options: { tickError?: Error; report?: WatchdogReport; sweepError?: Error }) {
  const calls: string[] = [];
  const runtime = {
    routines: {
      async tick(time: string) {
        calls.push(`tick ${time}`);
        if (options.tickError) throw options.tickError;
      },
    },
    watchdog: {
      async sweep() {
        calls.push("sweep");
        if (options.sweepError) throw options.sweepError;
        return options.report ?? { woken: [], failed: [] };
      },
    } as unknown as Watchdog,
  };
  return { runtime, calls };
}

async function failureOf(promise: Promise<void>): Promise<AggregateError> {
  const error = await promise.then(
    () => null,
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(AggregateError);
  return error as AggregateError;
}

verifies("runtime.scheduled", () => {
  describe("a cron run in Node", () => {
    it("ticks for the scheduled time, then sweeps the watchdog", async () => {
      const { runtime, calls } = fakeRuntime({});
      await runScheduled(runtime, at);
      expect(calls).toEqual([`tick ${at}`, "sweep"]);
    });

    it("still sweeps when the tick fails, and reports the tick", async () => {
      const { runtime, calls } = fakeRuntime({ tickError: new Error("secret-detail") });
      const error = await failureOf(runScheduled(runtime, at));
      expect(calls).toEqual([`tick ${at}`, "sweep"]);
      expect(error.message).toBe("The routine tick failed.");
      expect(error.message).not.toContain("secret-detail");
    });

    it("still ticks when the watchdog can't check a run, and names the run", async () => {
      const { runtime, calls } = fakeRuntime({
        report: { woken: [], failed: [{ runId: "r1", error: new Error("boom") }] },
      });
      const error = await failureOf(runScheduled(runtime, at));
      expect(calls).toEqual([`tick ${at}`, "sweep"]);
      expect(error.message).toBe("The watchdog couldn't check run r1.");
    });

    it("reports a sweep that fails as a whole", async () => {
      const { runtime } = fakeRuntime({ sweepError: new Error("boom") });
      expect((await failureOf(runScheduled(runtime, at))).message).toBe(
        "The watchdog's sweep failed.",
      );
    });

    it("reports both failures together", async () => {
      const { runtime } = fakeRuntime({
        tickError: new Error("a"),
        sweepError: new Error("b"),
      });
      const error = await failureOf(runScheduled(runtime, at));
      expect(error.errors).toHaveLength(2);
    });
  });
});
