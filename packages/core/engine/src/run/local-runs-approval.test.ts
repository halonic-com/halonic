import type { AgentResume } from "@halonicjs/events";
import { fixedIds } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { steppingClock } from "../agent/turn-test-kit.test-helper.ts";
import type { ModelCallResult } from "../kernel/decide-types.ts";
import { InputRefused } from "../kernel/input-refused.ts";
import { KernelBlobs, KernelRuns, replyWorkflow } from "../kernel/kernel-test-kit.test-helper.ts";
import type { PendingCall } from "../kernel/run-state.ts";
import { type CallModel, LocalRuns } from "./local-runs.ts";
import { replyStart, runsOn, TestScheduler, typesOf } from "./local-runs-test-kit.test-helper.ts";

const resume: AgentResume = {
  messages: [{ role: "user", content: "Reply to support" }],
  calls: [{ id: "m-7", name: "send_mail", arguments: { to: "support" } }],
  step: 1,
};

/**
 * Local runs whose agent stops at `send_mail` on its first call, and
 * answers `Sent` once it goes on. Every call it gets is kept.
 */
function approvingRuns() {
  const runs = new KernelRuns();
  const scheduler = new TestScheduler();
  const calls: PendingCall[] = [];
  const callModel: CallModel = async (_run, call): Promise<ModelCallResult> => {
    calls.push(call);
    return call.resume === undefined
      ? { type: "approval", tool: "send_mail", args: { to: "support" }, resume }
      : { type: "model", output: "Sent" };
  };
  const local = new LocalRuns(
    {
      store: runs,
      blobs: new KernelBlobs(),
      scheduler,
      ids: fixedIds(),
      definitionsOf: async () => ({ workflow: replyWorkflow }),
    },
    steppingClock(),
    callModel,
  );
  scheduler.onTimer = (timer) => local.onTimer(timer);
  return { local, runs, scheduler, calls };
}

verifies("engine.task-approvals", () => {
  it("waits for a person's OK through the executor, and goes on once it is given", async () => {
    const { local, runs, scheduler, calls } = approvingRuns();
    await local.start(replyStart);
    await scheduler.runDue();

    const waiting = await runs.get("run_1");
    expect(waiting).toMatchObject({ status: "waiting", accepts: ["approve", "reject"] });
    expect(waiting?.approvals).toMatchObject([{ callId: "call-2", tool: "send_mail" }]);

    const stale = local.send("run_1", "approve", undefined, { callId: "call-1" });
    await expect(stale).rejects.toThrow(InputRefused);
    expect(runs.logs.get("run_1")).toHaveLength(5);

    await local.send("run_1", "approve", undefined, { callId: "call-2" });
    await scheduler.runDue();

    expect(calls.map((call) => call.callId)).toEqual(["call-1", "call-3"]);
    expect(calls[1]?.resume).toEqual({ resume, approved: true });
    expect(await runs.get("run_1")).toMatchObject({
      status: "completed",
      approvals: [],
      context: { reply: "Sent" },
    });
    expect(typesOf(runs.logs.get("run_1")).slice(3, 7)).toEqual([
      "approval.requested",
      "run.waiting",
      "event.received",
      "approval.resolved",
    ]);
  });

  it("fails a run whose agent would go on after an approval, while runs offer no tools", async () => {
    const { executor, runs, scheduler } = runsOn([]);
    await executor.start(replyStart);
    scheduler.timers.clear();
    const at = "2026-11-09T09:00:05.000Z";
    await runs.append("run_1", 3, [
      {
        runId: "run_1",
        seq: 4,
        at,
        type: "approval.requested",
        state: "draft",
        agent: "writer",
        tool: "send_mail",
        args: {},
        callId: "call-2",
        resume,
      },
      { runId: "run_1", seq: 5, at, type: "run.waiting", state: "draft", events: ["approve"] },
    ]);

    await executor.send("run_1", "approve");
    await scheduler.runDue();

    expect(await runs.get("run_1")).toMatchObject({
      status: "failed",
      error: "A run's agent can't go on after an approval until runs offer it tools.",
    });
  });
});
