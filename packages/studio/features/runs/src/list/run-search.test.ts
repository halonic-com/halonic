import type { RunSummary } from "@halonicjs/events";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { mondayMorning, summaryWith } from "../summary.test-helper.ts";
import { runRow } from "./run-row.ts";
import { findRuns, SEARCHED_RUNS, SHOWN_RUNS } from "./run-search.ts";

function rowOf(id: string, changes: Partial<RunSummary> = {}, name = "Support reply") {
  const workflow = { name, stepDescription: () => undefined };
  return runRow(
    { summary: summaryWith({ id, ...changes }), madeToolCalls: false },
    { workflow, routine: undefined, currency: "EUR", now: mondayMorning },
  );
}

const ids = (rows: readonly { id: string }[]) => rows.map((row) => row.id);

verifies("runs.search", () => {
  const rows = [
    rowOf("run_a_01JD8Q"),
    rowOf("run_b_4f2a1b"),
    rowOf("run_c_zz01jd", {}, "Morning brief"),
  ];

  it("finds a run by its short id, with or without run or # in front", () => {
    for (const query of ["01jd8q", "Run 01JD8Q", "run  01jd8q", "#01jd8q", " 01JD8 "]) {
      expect(ids(findRuns(rows, query))).toEqual(["run_a_01JD8Q"]);
    }
  });

  it("finds runs by their workflow's name", () => {
    expect(ids(findRuns(rows, "brief"))).toEqual(["run_c_zz01jd"]);
  });

  it("puts a short id that starts with the words before one that holds them", () => {
    expect(ids(findRuns(rows, "01jd"))).toEqual(["run_a_01JD8Q", "run_c_zz01jd"]);
    const held = [rowOf("run_d_zz01jd"), rowOf("run_e_01jd8y")];
    expect(ids(findRuns(held, "01jd"))).toEqual(["run_e_01jd8y", "run_d_zz01jd"]);
  });

  it("finds nothing for no words, a bare run or #, or words nothing holds", () => {
    for (const query of ["", "  ", "run", "#", "zzz"]) {
      expect(findRuns(rows, query)).toEqual([]);
    }
  });

  it("looks through the newest 500 runs and shows at most 8", () => {
    const many = Array.from({ length: SEARCHED_RUNS + 1 }, (_, index) =>
      rowOf(`run_${index}_${String(index).padStart(6, "0")}`),
    );
    expect(findRuns(many, "support")).toHaveLength(SHOWN_RUNS);
    expect(findRuns(many, String(SEARCHED_RUNS).padStart(6, "0"))).toEqual([]);
  });
});
