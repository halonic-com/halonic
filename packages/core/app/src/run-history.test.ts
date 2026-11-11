import type { RunEventBody, RunKind } from "@halonicjs/events";
import type { RunFilter } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { type RunDetail, RunHistory, shortRunId } from "./run-history.ts";
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

/** The run `typed` points to, failing the test when it points to none or several. */
async function shownRun(history: RunHistory, typed: string): Promise<RunDetail> {
  const lookup = await history.showRun(typed);
  if (lookup.found !== "one") {
    throw new Error(`Expected one run for ${typed}, found ${lookup.found}`);
  }
  return lookup.run;
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

verifies("app.run-list-facts", () => {
  describe("hasTestRuns", () => {
    it("says the workspace has test runs when it has only those", async () => {
      const store = new MemoryRuns();
      const history = new RunHistory(store);
      expect(await history.hasTestRuns()).toBe(false);

      store.add("run_test", at(1), [started("support-reply", "test"), completed]);

      expect(await history.listRuns()).toEqual({ runs: [], total: 0 });
      expect(await history.hasTestRuns()).toBe(true);
    });
  });

  describe("sends", () => {
    it("says whether a run's log has a tool call, and what it sent", async () => {
      const store = new MemoryRuns();
      const toolCall: RunEventBody = {
        type: "tool.called",
        agent: "writer",
        tool: "gmail_send",
        args: {},
      };
      const toolResult: RunEventBody = {
        type: "tool.result",
        agent: "writer",
        tool: "gmail_send",
        result: "sent",
        outcome: "ok",
        risk: "send",
        noun: { one: "email", many: "emails" },
      };
      store.add("run_sent", at(1), [started("support-reply"), toolCall, toolResult, completed]);
      store.add("run_quiet", at(2), [started("support-reply"), completed]);
      const history = new RunHistory(store);

      expect(await history.sends("run_sent")).toEqual({
        sent: [{ verb: "sent", counts: [{ noun: { one: "email", many: "emails" }, calls: 1 }] }],
        maySend: [],
        madeToolCalls: true,
      });
      expect(await history.sends("run_quiet")).toEqual({
        sent: [],
        maySend: [],
        madeToolCalls: false,
      });
    });
  });
});

verifies("app.run-show", () => {
  describe("showRun", () => {
    it("shows a run's summary and its whole log, oldest first", async () => {
      const store = new MemoryRuns();
      store.add("01JD8Q", at(1), [started("support-reply"), completed]);

      const detail = await shownRun(new RunHistory(store), "01JD8Q");

      expect(detail.summary).toMatchObject({ id: "01JD8Q", status: "completed" });
      expect(detail.events.map((event) => [event.seq, event.type])).toEqual([
        [1, "run.started"],
        [2, "run.completed"],
      ]);
    });

    it("shows a waiting run with the events it accepts", async () => {
      const store = new MemoryRuns();
      store.add("01JD9A", at(1), [started("support-reply"), waiting]);

      const detail = await shownRun(new RunHistory(store), "01JD9A");

      expect(detail.summary).toMatchObject({ status: "waiting", accepts: ["approve", "reject"] });
    });

    it("shows a test run like any other", async () => {
      const store = new MemoryRuns();
      store.add("run_test", at(1), [started("support-reply", "test")]);

      const detail = await shownRun(new RunHistory(store), "run_test");

      expect(detail.summary).toMatchObject({ id: "run_test", kind: "test" });
    });

    it("shows nothing for a run id the store doesn't know", async () => {
      expect(await new RunHistory(new MemoryRuns()).showRun("01JD8X")).toEqual({ found: "none" });
    });
  });
});

verifies("app.run-short-id", () => {
  describe("shortRunId", () => {
    it("is the last 6 characters of the id, as stored", () => {
      expect(shortRunId("run_mfx3k2a1_a1b2c3d4")).toBe("b2c3d4");
    });
  });

  describe("findRun", () => {
    function oneRun(): MemoryRuns {
      const store = new MemoryRuns();
      store.add("run_mfx3k2a1_a1b2c3d4", at(1), [started("support-reply"), completed]);
      return store;
    }

    it.each(["run_mfx3k2a1_a1b2c3d4", "RUN_MFX3K2A1_A1B2C3D4", "b2c3d4", "B2C3D4"])(
      "finds the run from %s",
      async (typed) => {
        expect(await new RunHistory(oneRun()).findRun(typed)).toEqual({
          found: "one",
          run: "run_mfx3k2a1_a1b2c3d4",
        });
      },
    );

    it("gives the id as stored when the store ignores case, as files on Windows do", async () => {
      const stored = oneRun();
      // Like the file stores on Windows: the log opens from the id in any
      // case, then its events carry another id than the one asked for.
      const ignoringCase = {
        list: (filter?: RunFilter) => stored.list(filter),
        events: async (runId: string) => {
          const events = await stored.events(runId.toLowerCase());
          if (events.some((event) => event.runId !== runId)) {
            throw new Error(`Broken run log ${runId}.jsonl`);
          }
          return events;
        },
      };

      expect(await new RunHistory(ignoringCase).findRun("RUN_MFX3K2A1_A1B2C3D4")).toEqual({
        found: "one",
        run: "run_mfx3k2a1_a1b2c3d4",
      });
    });

    it("finds a test run by its short id", async () => {
      const store = new MemoryRuns();
      store.add("run_mfx3k2a1_0f9e8d7c", at(1), [started("support-reply", "test")]);

      expect(await new RunHistory(store).findRun("9e8d7c")).toEqual({
        found: "one",
        run: "run_mfx3k2a1_0f9e8d7c",
      });
    });

    it("finds several runs, and picks none, when two ids end in the short id", async () => {
      const store = new MemoryRuns();
      store.add("run_aaaa_01b2c3d4", at(1), [started("support-reply")]);
      store.add("run_bbbb_99b2c3d4", at(2), [started("mail-triage")]);

      // The short id as stored, as the list printed it, not as typed.
      expect(await new RunHistory(store).findRun("B2C3D4")).toEqual({
        found: "several",
        shortId: "b2c3d4",
      });
    });

    it("still finds one of those runs by its full id", async () => {
      const store = new MemoryRuns();
      store.add("run_aaaa_01b2c3d4", at(1), [started("support-reply")]);
      store.add("run_bbbb_99b2c3d4", at(2), [started("mail-triage")]);

      expect(await new RunHistory(store).findRun("run_aaaa_01b2c3d4")).toEqual({
        found: "one",
        run: "run_aaaa_01b2c3d4",
      });
    });

    it.each(["a1b2c3d4", "c3d4", "zzzzzz", ""])("finds nothing from %j", async (typed) => {
      expect(await new RunHistory(oneRun()).findRun(typed)).toEqual({ found: "none" });
    });
  });

  describe("showRun", () => {
    it("shows a run from its short id, in capitals", async () => {
      const store = new MemoryRuns();
      store.add("run_mfx3k2a1_a1b2c3d4", at(1), [started("support-reply"), completed]);

      const detail = await shownRun(new RunHistory(store), "B2C3D4");

      expect(detail.summary).toMatchObject({ id: "run_mfx3k2a1_a1b2c3d4", status: "completed" });
    });

    it("shows no run when two ids end in the short id", async () => {
      const store = new MemoryRuns();
      store.add("run_aaaa_01b2c3d4", at(1), [started("support-reply")]);
      store.add("run_bbbb_99b2c3d4", at(2), [started("mail-triage")]);

      expect(await new RunHistory(store).showRun("b2c3d4")).toEqual({
        found: "several",
        shortId: "b2c3d4",
      });
    });
  });
});
