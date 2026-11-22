import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { replyStart, runsOn } from "./local-runs-test-kit.test-helper.ts";

/** A store that holds one run, `run_1`, left `running` by an engine that is still going. */
async function storeWithRunningRun() {
  const other = runsOn([]);
  await other.executor.start(replyStart);
  expect(await other.runs.get("run_1")).toMatchObject({ status: "running" });
  return other.runs;
}

verifies("engine.skip-lost-run-sweep", () => {
  it("leaves a running run as it is when an engine with the sweep off starts another run", async () => {
    const store = await storeWithRunningRun();
    const logLength = (await store.events("run_1")).length;

    const worker = runsOn([], store, { sweepsLostRuns: false });
    await worker.executor.start({ ...replyStart, runId: "run_2" });

    expect(await store.get("run_1")).toMatchObject({ status: "running" });
    expect(await store.events("run_1")).toHaveLength(logLength);
  });

  it("tells 0 when it gets ready with the sweep off, and ends nothing", async () => {
    const store = await storeWithRunningRun();

    const worker = runsOn([], store, { sweepsLostRuns: false });

    expect(await worker.executor.endLostRuns()).toBe(0);
    expect(await store.get("run_1")).toMatchObject({ status: "running" });
  });

  it("still ends the lost runs when the option is left out", async () => {
    const store = await storeWithRunningRun();

    const restarted = runsOn([], store);
    await restarted.executor.start({ ...replyStart, runId: "run_2" });

    expect(await store.get("run_1")).toMatchObject({ reason: "interrupted" });
  });
});
