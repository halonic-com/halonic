import { type RunEvent, type RunSummary, summarize } from "@halonicjs/events";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { checkRunAppend, compareRunSummaries, matchesRunFilter } from "./index.ts";

function entered(runId: string, seq: number): RunEvent {
  return { runId, seq, at: "2026-01-01T00:00:00.000Z", type: "state.entered", state: "s" };
}

/** The summary of a waiting run of hub `a`, started at `at`. */
function summary(id: string, at: string): RunSummary {
  const run = summarize([
    {
      runId: id,
      seq: 1,
      at,
      type: "run.started",
      hubId: "a",
      workflowId: "flow",
      input: {},
      kind: "run",
      definitionsVersion: "v1",
    },
    { runId: id, seq: 2, at, type: "run.waiting", state: "s", events: ["approve"] },
  ]);
  if (run === null) {
    throw new Error("summarize gave no summary");
  }
  return run;
}

// The contract suite runs these rules through every adapter; this checks the shared helpers on their own.
verifies("ports.run-store-checks", () => {
  it("refuses an append that is the caller's bug", () => {
    expect(() => checkRunAppend("r1", 1, [entered("r1", 2)])).not.toThrow();
    const bugs: [number, RunEvent[]][] = [
      [-1, [entered("r1", 0)]],
      [0.5, [entered("r1", 1)]],
      [0, []],
      [0, [entered("r2", 1)]],
      [0, [entered("r1", 2)]],
    ];
    for (const [expectedSeq, events] of bugs) {
      expect(() => checkRunAppend("r1", expectedSeq, events)).toThrow(RangeError);
    }
  });

  it("matches a summary against every field of a filter", () => {
    const run = summary("r1", "2026-01-01T00:00:00.000Z");
    expect(matchesRunFilter(run, {})).toBe(true);
    expect(matchesRunFilter(run, { hubId: "a", status: [] })).toBe(true);
    expect(matchesRunFilter(run, { status: ["running", "waiting"] })).toBe(true);
    expect(matchesRunFilter(run, { status: "failed" })).toBe(false);
    expect(matchesRunFilter(run, { workflowId: "other" })).toBe(false);
    expect(matchesRunFilter(run, { kind: "test" })).toBe(false);
  });

  it("orders summaries newest start first, then by run id", () => {
    const runs = [
      summary("b", "2026-01-01T00:00:00.000Z"),
      summary("c", "2026-01-02T00:00:00.000Z"),
      summary("a", "2026-01-01T00:00:00.000Z"),
    ];
    expect(runs.sort(compareRunSummaries).map((run) => run.id)).toEqual(["c", "a", "b"]);
  });
});
