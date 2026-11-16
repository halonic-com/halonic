import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { replyStart, runsOn } from "./local-runs-test-kit.test-helper.ts";

verifies("engine.report-interrupted-runs", () => {
  it("ends the lost runs when it gets ready, and tells how many were interrupted, every time", async () => {
    const before = runsOn([]);
    await before.executor.start(replyStart);
    await before.executor.start({ ...replyStart, runId: "run_2" });

    const after = runsOn([], before.runs);
    expect(await after.executor.endLostRuns()).toBe(2);

    expect(await before.runs.get("run_1")).toMatchObject({ reason: "interrupted" });
    expect(await before.runs.get("run_2")).toMatchObject({ reason: "interrupted" });
    const logLength = (await before.runs.events("run_1")).length;
    expect(await after.executor.endLostRuns()).toBe(2);
    expect(await before.runs.events("run_1")).toHaveLength(logLength);
  });

  it("tells 0 when no run was lost, and when the executor has no runs", async () => {
    expect(await runsOn([]).executor.endLostRuns()).toBe(0);
  });
});
