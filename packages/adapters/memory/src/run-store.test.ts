import type { RunEvent } from "@halonicjs/events";
import { expect, it } from "vitest";
import { MemoryRunStore } from "./run-store.ts";

/** A `run.started` event at `at`. */
function started(runId: string, at: string): RunEvent {
  return {
    runId,
    seq: 1,
    at,
    type: "run.started",
    hubId: "hub",
    workflowId: "flow",
    input: {},
    kind: "run",
    definitionsVersion: "v1",
  };
}

it("lists runs that started at the same time by run id", async () => {
  const store = new MemoryRunStore();
  const at = "2026-02-01T00:00:00.000Z";
  for (const runId of ["c", "a", "b"]) await store.append(runId, 0, [started(runId, at)]);
  expect((await store.list()).map((summary) => summary.id)).toEqual(["a", "b", "c"]);
});
