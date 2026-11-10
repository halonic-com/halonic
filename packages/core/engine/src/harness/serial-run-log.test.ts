import type { RunEvent } from "@halonicjs/events";
import { describe, expect, it } from "vitest";
import { steppingClock } from "../agent/turn-test-kit.test-helper.ts";
import { keepDefinitions } from "../kernel/kept-definitions.ts";
import {
  answer,
  KernelBlobs,
  KernelRuns,
  replyWorkflow,
  startInput,
} from "../kernel/kernel-test-kit.test-helper.ts";
import { step } from "../kernel/step.ts";
import { SerialRunLog } from "./serial-run-log.ts";

/** A run of the reply workflow that waits on its writer's call, `call-1`, at event 3. */
async function runWaitingOnCall() {
  const runs = new KernelRuns();
  const blobs = new KernelBlobs();
  const version = await keepDefinitions(blobs, { workflow: replyWorkflow });
  const ports = { runs, blobs };
  await step(ports, "r-acme", startInput(version));
  const lastSeq = runs.logs.get("r-acme")?.length ?? 0;
  return { runs, ports, lastSeq };
}

/** An event another writer adds to the run's log, which leaves its call waiting. */
function otherWriters(lastSeq: number): RunEvent {
  return {
    type: "tool.called",
    agent: "writer",
    tool: "Read",
    args: {},
    runId: "r-acme",
    seq: lastSeq + 1,
    at: "2026-11-09T09:00:01.000Z",
  };
}

describe("SerialRunLog", () => {
  it("appends events given at the same time one after the other, in order", async () => {
    const runs = new KernelRuns();
    const log = new SerialRunLog(runs, "run_1", "call-1", 0, steppingClock());

    await Promise.all([
      log.append({ type: "state.entered", state: "a" }),
      log.append({ type: "state.entered", state: "b" }),
    ]);

    expect(runs.logs.get("run_1")?.map((event) => [event.seq, event.type])).toEqual([
      [1, "state.entered"],
      [2, "state.entered"],
    ]);
  });

  it("writes after another writer's event while the run still waits on the call", async () => {
    const { runs, lastSeq } = await runWaitingOnCall();
    const log = new SerialRunLog(runs, "r-acme", "call-1", lastSeq, steppingClock());
    await runs.append("r-acme", lastSeq, [otherWriters(lastSeq)]);

    await log.append({ type: "tool.called", agent: "writer", tool: "Grep", args: {} });

    expect(runs.logs.get("r-acme")?.slice(-2)).toMatchObject([
      { seq: lastSeq + 1, tool: "Read" },
      { seq: lastSeq + 2, tool: "Grep" },
    ]);
  });

  it("refuses to write once the run no longer waits on the call, and every append after it", async () => {
    const { runs, ports, lastSeq } = await runWaitingOnCall();
    const log = new SerialRunLog(runs, "r-acme", "call-1", lastSeq, steppingClock());
    await step(ports, "r-acme", answer("call-1", "Thanks!"));
    const ended = runs.logs.get("r-acme")?.length;

    const first = log.append({ type: "tool.called", agent: "writer", tool: "Read", args: {} });
    const second = log.append({ type: "tool.called", agent: "writer", tool: "Grep", args: {} });

    await expect(first).rejects.toThrow("moved on from call call-1");
    await expect(second).rejects.toThrow("moved on");
    expect(runs.logs.get("r-acme")).toHaveLength(ended ?? 0);
  });

  it("settles once every append given so far is stored", async () => {
    const runs = new KernelRuns();
    const log = new SerialRunLog(runs, "run_1", "call-1", 0, steppingClock());

    void log.append({ type: "state.entered", state: "a" });
    void log.append({ type: "state.entered", state: "b" });
    await log.settled();

    expect(runs.logs.get("run_1")).toHaveLength(2);
  });

  it("settles without throwing when an append failed", async () => {
    const runs = new KernelRuns();
    const log = new SerialRunLog(runs, "run_1", "call-1", 3, steppingClock());

    const failed = log.append({ type: "state.entered", state: "a" });

    await expect(log.settled()).resolves.toBeUndefined();
    await expect(failed).rejects.toThrow("moved on");
  });
});
