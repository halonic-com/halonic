import type { RunSummary } from "@halonicjs/events";
import type { SendOptions } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { inboxDecisions } from "./decide.ts";
import { inboxItems } from "./inbox-items.ts";
import { pendingApproval, waitingRun } from "./test-runs.test-helper.ts";

/** An executor that records what is sent to it. */
function recordingExecutor() {
  const sent: {
    runId: string;
    event: string;
    payload: unknown;
    options: SendOptions | undefined;
  }[] = [];
  return {
    sent,
    send: async (runId: string, event: string, payload?: unknown, options?: SendOptions) => {
      sent.push({ runId, event, payload, options });
      return waitingRun(runId) as RunSummary;
    },
  };
}

const [toolCall] = inboxItems([
  waitingRun("r1", { approvals: [pendingApproval("call-1", "notes-mcp__create_note", "T1")] }),
]);
const [review] = inboxItems([
  waitingRun("r2", { waitingFor: { title: "Approve this reply?", body: "" } }),
]);

verifies("inbox.decisions", () => {
  it("approves and rejects a tool call by its call id", async () => {
    const executor = recordingExecutor();
    const decisions = inboxDecisions(executor);
    if (toolCall === undefined) throw new Error("expected a tool call item");
    await decisions.approve(toolCall);
    await decisions.reject(toolCall);
    expect(executor.sent).toEqual([
      { runId: "r1", event: "approve", payload: undefined, options: { callId: "call-1" } },
      { runId: "r1", event: "reject", payload: undefined, options: { callId: "call-1" } },
    ]);
  });

  it("sends a note with Ask for changes as a reject with a comment", async () => {
    const executor = recordingExecutor();
    if (toolCall === undefined) throw new Error("expected a tool call item");
    await inboxDecisions(executor).askForChanges(toolCall, "Use the shorter title");
    expect(executor.sent).toEqual([
      {
        runId: "r1",
        event: "reject",
        payload: { comment: "Use the shorter title" },
        options: { callId: "call-1" },
      },
    ]);
  });

  it("answers a wait step without a call id", async () => {
    const executor = recordingExecutor();
    if (review === undefined) throw new Error("expected a wait item");
    await inboxDecisions(executor).reject(review);
    expect(executor.sent).toEqual([
      { runId: "r2", event: "reject", payload: undefined, options: undefined },
    ]);
  });
});
