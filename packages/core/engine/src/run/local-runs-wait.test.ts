import type { Clock } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { approvalWorkflow, KernelRuns } from "../kernel/kernel-test-kit.test-helper.ts";
import { runsOn } from "./local-runs-test-kit.test-helper.ts";

/** A clock that stands still until the test moves it. */
function settableClock(start: string) {
  let now = Date.parse(start);
  const clock: Clock = { now: () => new Date(now) };
  return { clock, moveTo: (at: string) => (now = Date.parse(at)) };
}

const approvalStart = { hubId: "acme", workflowId: "approval", input: {} };

function approvalRuns() {
  const time = settableClock("2026-11-09T09:00:00.000Z");
  const setup = { workflow: approvalWorkflow(), clock: time.clock };
  return { ...runsOn([], new KernelRuns(), setup), moveTo: time.moveTo };
}

verifies("engine.wait-state", () => {
  it("waits for a person through the executor, and moves on the event sent", async () => {
    const { executor, runs, scheduler } = approvalRuns();

    const waiting = await executor.start(approvalStart);

    expect(waiting).toMatchObject({
      status: "waiting",
      accepts: ["approve", "reject"],
      nextTimer: "2026-11-11T09:00:00.000Z",
    });
    expect([...scheduler.timers.values()]).toEqual([
      { key: "run_1", timerId: "timer:3:2", at: "2026-11-11T09:00:00.000Z" },
    ]);
    const approved = await executor.send("run_1", "approve", { note: "ok" });
    expect(approved).toMatchObject({
      status: "completed",
      state: "approved",
      context: { outcome: "pending", lastEvent: { note: "ok" } },
    });
    expect(runs.logs.get("run_1")).toHaveLength(9);
  });
});

verifies("engine.wait-timers", () => {
  it("sets an early timer again, then moves on once it is due", async () => {
    const { executor, runs, scheduler, moveTo } = approvalRuns();
    await executor.start(approvalStart);
    const [timer] = [...scheduler.timers.values()];
    if (timer === undefined) throw new Error("expected the state's timer");

    moveTo("2026-11-10T09:00:00.000Z");
    await executor.onTimer(timer);
    expect(runs.logs.get("run_1")).toHaveLength(4);
    expect(await scheduler.pending("run_1")).toEqual([timer]);

    moveTo("2026-11-11T09:00:00.000Z");
    await executor.onTimer(timer);
    expect(await runs.get("run_1")).toMatchObject({ status: "completed", state: "expired" });
  });
});

verifies("engine.decision-callid-must-match", () => {
  it("refuses an event for a call the run doesn't wait on, and records nothing", async () => {
    const { executor, runs } = approvalRuns();
    await executor.start(approvalStart);

    await expect(
      executor.send("run_1", "approve", undefined, { callId: "call-1" }),
    ).rejects.toMatchObject({
      code: "engine.decision-callid-must-match",
    });
    expect(runs.logs.get("run_1")).toHaveLength(4);
  });
});
