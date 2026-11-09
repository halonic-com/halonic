import { runExecutorContract } from "@halonicjs/testing-contracts";
import { describe, expect, it } from "vitest";
import { TestExecutor } from "./test-executor.ts";

// The kernel's fake executor keeps the port's rules, so a kernel test can't
// pass on it and fail on a real executor.
runExecutorContract("kernel test fake", async () => {
  const executor = new TestExecutor();
  return {
    executor,
    async waitForApproval() {
      const run = await executor.start({ hubId: "acme", workflowId: "review", input: {} });
      executor.awaitApproval(run.id, "call-1");
      return { runId: run.id, event: "approve", callId: "call-1" };
    },
  };
});

describe("TestExecutor approvals", () => {
  it("keeps a run waiting until every approval is answered", async () => {
    const executor = new TestExecutor();
    const run = await executor.start({ hubId: "acme", workflowId: "review", input: {} });
    // Two parallel branches each wait for one call.
    executor.awaitApproval(run.id, "call-1");
    executor.awaitApproval(run.id, "call-2");

    const afterFirst = await executor.send(run.id, "approve", undefined, { callId: "call-2" });
    expect(afterFirst.status).toBe("waiting");
    expect(afterFirst.approvals.map((approval) => approval.callId)).toEqual(["call-1"]);

    const afterSecond = await executor.send(run.id, "approve");
    expect(afterSecond.status).toBe("running");
    expect(afterSecond.approvals).toEqual([]);
  });

  it("names the kernel's code when the call id doesn't match", async () => {
    const executor = new TestExecutor();
    const run = await executor.start({ hubId: "acme", workflowId: "review", input: {} });
    executor.awaitApproval(run.id, "call-1");

    await expect(executor.send(run.id, "approve", undefined, { callId: "call-9" })).rejects.toThrow(
      "engine.decision-callid-must-match",
    );
  });
});
