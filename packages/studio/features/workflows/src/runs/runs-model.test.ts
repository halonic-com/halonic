import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { runSummary } from "../test-support.tsx";
import { EARLIER_LIMIT, realRunsOf, runCount, runRowsOf, runSections } from "./runs-model.ts";

const reply = { hubId: "acme", id: "reply" };
const source = {
  workflow: () => ({ name: "Support reply", stepDescription: () => undefined }),
  routine: () => undefined,
  providerKind: () => undefined,
  currency: () => "EUR",
};
const sourced = (changes: Parameters<typeof runSummary>[0]) => ({
  summary: runSummary(changes),
  madeToolCalls: false,
});
const done = (id: string) =>
  sourced({ id, status: "completed", state: null, endedAt: "2026-11-09T10:45:00.000Z" });

verifies("workflows.runs.runs-view", () => {
  it("keeps only this workflow's real runs, never a test run or another workflow's", () => {
    const runs = [
      sourced({ id: "real" }),
      sourced({ id: "test", kind: "test" }),
      sourced({ id: "other", workflowId: "invoice" }),
      sourced({ id: "elsewhere", hubId: "home" }),
    ];

    expect(realRunsOf(runs, reply).map((run) => run.summary.id)).toEqual(["real"]);
  });

  it("puts running and waiting runs in Now and the 20 newest finished in Earlier", () => {
    const finished = Array.from({ length: 25 }, (_, at) => done(`done-${at}`));
    const rows = runRowsOf([sourced({ id: "going" }), ...finished], reply, source, new Date());

    const sections = runSections(rows);

    expect(sections.now.map((row) => row.id)).toEqual(["going"]);
    expect(sections.earlier).toHaveLength(EARLIER_LIMIT);
    expect(sections.earlier[0]?.id).toBe("done-0");
  });

  it("counts the runs that need the person for the Runs tab, and none before they load", () => {
    const waiting = { status: "waiting" as const, waitingOn: "approve", state: "approve" };
    const runs = [sourced({ id: "a", ...waiting }), sourced({ id: "b", ...waiting }), done("c")];

    const count = (load: Parameters<typeof runCount>[0]) => runCount(load, reply, source);

    expect(count({ kind: "ready", runs })).toBe(
      runSections(runRowsOf(runs, reply, source, new Date())).needYou,
    );
    expect(count({ kind: "loading", skeleton: false, slow: false })).toBe(0);
  });
});
