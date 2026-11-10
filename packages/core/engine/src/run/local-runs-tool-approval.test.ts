import type { ChatResponse } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { halonicTool } from "../agent/turn-test-kit.test-helper.ts";
import type { HalonicTool } from "../agent/turn-tools.ts";
import { KernelBlobs, KernelRuns } from "../kernel/kernel-test-kit.test-helper.ts";
import { call, callAnswer, textAnswer } from "../testing/scripted-model.ts";
import { replyStart, runsOn, typesOf } from "./local-runs-test-kit.test-helper.ts";

/** A `write` tool, so every call to it waits for a person's OK, that notes each run. */
function publishTool(ran: string[]): HalonicTool {
  const tool = halonicTool("publish", async () => {
    ran.push("publish");
    return "published";
  });
  return { ...tool, risk: "write" };
}

const publishCall = callAnswer(call("p-1", "publish"));

/** A run of the reply workflow that is waiting for the OK on `publish`. */
async function waitingRun(
  after: ChatResponse[],
  runs = new KernelRuns(),
  blobs = new KernelBlobs(),
) {
  const ran: string[] = [];
  const setup = runsOn([publishCall, ...after], runs, {
    halonicTools: [publishTool(ran)],
    blobs,
  });
  await setup.executor.start(replyStart);
  await setup.scheduler.runDue();
  return { ...setup, ran, blobs };
}

/** The tool message the model got for `p-1` in its request at `index`. */
function publishResult(
  requests: { messages: { role: string; content: string }[] }[],
  index: number,
) {
  return requests[index]?.messages.find((message) => message.role === "tool")?.content;
}

verifies("engine.run-tool-calls", () => {
  it("stops a run at a call that needs a person's OK, and runs nothing", async () => {
    const { runs, ran } = await waitingRun([]);

    expect(ran).toEqual([]);
    expect(await runs.get("run_1")).toMatchObject({
      status: "waiting",
      accepts: ["approve", "reject"],
      approvals: [{ callId: "call-2", tool: "publish" }],
    });
    expect(typesOf(runs.logs.get("run_1")).slice(-2)).toEqual([
      "approval.requested",
      "run.waiting",
    ]);
  });

  it("runs the approved call and goes on to the agent's answer", async () => {
    const { executor, scheduler, runs, model, ran } = await waitingRun([textAnswer("Posted")]);

    await executor.send("run_1", "approve", undefined, { callId: "call-2" });
    await scheduler.runDue();

    expect(ran).toEqual(["publish"]);
    expect(publishResult(model.requests, 1)).toBe("published");
    expect(await runs.get("run_1")).toMatchObject({
      status: "completed",
      context: { reply: "Posted" },
    });
  });

  it("gives the model a rejection, with the person's comment, as the call's result", async () => {
    const { executor, scheduler, runs, model, ran } = await waitingRun([textAnswer("Not posted")]);

    await executor.send("run_1", "reject", { comment: "Not today" });
    await scheduler.runDue();

    expect(ran).toEqual([]);
    expect(publishResult(model.requests, 1)).toBe(
      "Refused: a person rejected the call and wrote: Not today",
    );
    expect(await runs.get("run_1")).toMatchObject({
      status: "completed",
      context: { reply: "Not posted" },
    });
  });

  it("goes on after a restart, from what the run log and blob store kept", async () => {
    const { runs, blobs } = await waitingRun([]);
    const ran: string[] = [];
    const restarted = runsOn([textAnswer("Posted")], runs, {
      halonicTools: [publishTool(ran)],
      blobs,
    });

    await restarted.executor.send("run_1", "approve");
    await restarted.scheduler.runDue();

    expect(ran).toEqual(["publish"]);
    expect(restarted.model.requests[0]?.messages.map((message) => message.role)).toEqual([
      "user",
      "assistant",
      "tool",
    ]);
    expect(await runs.get("run_1")).toMatchObject({ status: "completed" });
  });
});
