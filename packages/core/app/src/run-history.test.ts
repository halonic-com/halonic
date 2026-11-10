import type { RunEventBody, RunKind } from "@halonicjs/events";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { RunHistory } from "./run-history.ts";
import { MemoryRuns } from "./testing/memory-runs.ts";

function started(workflowId: string, kind: RunKind = "run"): RunEventBody {
  return {
    type: "run.started",
    hubId: "acme",
    workflowId,
    input: {},
    kind,
    definitionsVersion: "v1",
  };
}

const failed: RunEventBody = { type: "run.failed", state: "classify", error: "boom" };
const completed: RunEventBody = { type: "run.completed", state: "send", context: {} };
const waiting: RunEventBody = {
  type: "run.waiting",
  state: "review",
  events: ["approve", "reject"],
};

/** The minute `minute` past 10:00 on 9 Nov, so a larger minute is a newer run. */
function at(minute: number): string {
  return new Date(Date.UTC(2026, 10, 9, 10, minute)).toISOString();
}

verifies("app.run-list", () => {
  describe("listRuns", () => {
    it("returns the 20 newest runs, newest first, and how many there are in all", async () => {
      const store = new MemoryRuns();
      for (let minute = 0; minute < 23; minute++) {
        store.add(`run_${minute}`, at(minute), [started("support-reply"), completed]);
      }

      const list = await new RunHistory(store).listRuns();

      expect(list.total).toBe(23);
      expect(list.runs.map((run) => run.id)).toEqual(
        Array.from({ length: 20 }, (_, index) => `run_${22 - index}`),
      );
    });

    it("returns at most the limit asked for", async () => {
      const store = new MemoryRuns();
      store.add("run_old", at(1), [started("support-reply")]);
      store.add("run_new", at(2), [started("support-reply")]);

      const list = await new RunHistory(store).listRuns({}, 1);

      expect(list).toMatchObject({ runs: [{ id: "run_new" }], total: 2 });
    });

    it("lists the runs of one status, and never a test run", async () => {
      const store = new MemoryRuns();
      store.add("run_failed", at(1), [started("support-reply"), failed]);
      store.add("run_waiting", at(2), [started("support-reply"), waiting]);
      store.add("run_failed_too", at(3), [started("mail-triage"), failed]);
      store.add("run_test", at(4), [started("support-reply", "test"), failed]);

      const list = await new RunHistory(store).listRuns({ status: "failed" });

      expect(list.runs.map((run) => run.id)).toEqual(["run_failed_too", "run_failed"]);
      expect(list.total).toBe(2);
    });

    it("lists the runs of one workflow", async () => {
      const store = new MemoryRuns();
      store.add("run_reply", at(1), [started("support-reply")]);
      store.add("run_triage", at(2), [started("mail-triage")]);

      const list = await new RunHistory(store).listRuns({ workflowId: "mail-triage" });

      expect(list).toMatchObject({ runs: [{ id: "run_triage" }], total: 1 });
    });

    it("gives an empty list when there are no runs", async () => {
      const list = await new RunHistory(new MemoryRuns()).listRuns();

      expect(list).toEqual({ runs: [], total: 0 });
    });

    it.each([0, -1, 2.5, Number.NaN])("refuses a limit of %s", async (limit) => {
      const history = new RunHistory(new MemoryRuns());

      await expect(history.listRuns({}, limit)).rejects.toThrow(RangeError);
    });
  });
});

verifies("app.run-show", () => {
  describe("showRun", () => {
    it("shows a run's summary and its whole log, oldest first", async () => {
      const store = new MemoryRuns();
      store.add("01JD8Q", at(1), [started("support-reply"), completed]);

      const detail = await new RunHistory(store).showRun("01JD8Q");

      expect(detail?.summary).toMatchObject({ id: "01JD8Q", status: "completed" });
      expect(detail?.events.map((event) => [event.seq, event.type])).toEqual([
        [1, "run.started"],
        [2, "run.completed"],
      ]);
    });

    it("shows a waiting run with the events it accepts", async () => {
      const store = new MemoryRuns();
      store.add("01JD9A", at(1), [started("support-reply"), waiting]);

      const detail = await new RunHistory(store).showRun("01JD9A");

      expect(detail?.summary).toMatchObject({ status: "waiting", accepts: ["approve", "reject"] });
    });

    it("shows a test run like any other", async () => {
      const store = new MemoryRuns();
      store.add("run_test", at(1), [started("support-reply", "test")]);

      const detail = await new RunHistory(store).showRun("run_test");

      expect(detail?.summary).toMatchObject({ id: "run_test", kind: "test" });
    });

    it("shows nothing for a run id the store doesn't know", async () => {
      expect(await new RunHistory(new MemoryRuns()).showRun("01JD8X")).toBeNull();
    });
  });
});
