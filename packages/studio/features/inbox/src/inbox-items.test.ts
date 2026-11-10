import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { inboxItems } from "./inbox-items.ts";
import { pendingApproval, waitingRun } from "./test-runs.test-helper.ts";

const reply = "Hello, your refund is on its way.";

verifies("inbox.items", () => {
  it("lists one item per waiting tool call, newest first", () => {
    const run = waitingRun("r1", {
      state: "sort",
      approvals: [
        pendingApproval("call-1", "notes-mcp__create_note", "2026-11-10T10:42:00.000Z"),
        pendingApproval("call-2", "notes-mcp__create_note", "2026-11-10T10:43:00.000Z"),
      ],
    });
    const items = inboxItems([run]);
    expect(items.map((item) => item.key)).toEqual(["r1:call-2", "r1:call-1"]);
    expect(items[1]).toEqual({
      kind: "approval",
      key: "r1:call-1",
      runId: "r1",
      callId: "call-1",
      agent: "sorter",
      tool: "create_note",
      connector: "notes-mcp",
      rawTool: "notes-mcp__create_note",
      args: { title: "Refund for order 1042" },
      since: "2026-11-10T10:42:00.000Z",
      state: "sort",
      branch: null,
      item: null,
    });
  });

  it("gives a built-in tool no connector", () => {
    const run = waitingRun("r1", { approvals: [pendingApproval("call-1", "search", "T1")] });
    expect(inboxItems([run])[0]).toMatchObject({ tool: "search", connector: null });
    const leading = waitingRun("r1", { approvals: [pendingApproval("call-1", "__search", "T1")] });
    expect(inboxItems([leading])[0]).toMatchObject({ tool: "__search", connector: null });
  });

  it("lists a run at a wait step with the description core filled in", () => {
    const run = waitingRun("r2", {
      waitingFor: { title: "Approve this reply?", body: reply },
      nextTimer: "2026-11-12T10:40:00.000Z",
    });
    expect(inboxItems([run])).toEqual([
      {
        kind: "wait",
        key: "r2:review",
        runId: "r2",
        state: "review",
        title: "Approve this reply?",
        body: reply,
        accepts: ["approve", "reject"],
        answerLabels: {},
        since: "2026-11-10T10:40:00.000Z",
        movesOnAt: "2026-11-12T10:40:00.000Z",
      },
    ]);
  });

  it("gives a wait step's own answer labels as core sends them", () => {
    const run = waitingRun("r2", {
      accepts: ["approve", "reject", "escalate"],
      answerLabels: { approve: "Send reply", escalate: "Ask a lead" },
    });
    expect(inboxItems([run])[0]).toMatchObject({
      answerLabels: { approve: "Send reply", escalate: "Ask a lead" },
    });
  });

  it("names a wait step without a description by its id with a capital", () => {
    const [item] = inboxItems([waitingRun("r3")]);
    expect(item).toMatchObject({ title: "Review", body: "" });
  });

  it("lists nothing for runs that don't wait for you", () => {
    const runs = [
      waitingRun("parent", { waitingOn: "child" }),
      waitingRun("running", { status: "running" }),
      waitingRun("done", { status: "completed" }),
      waitingRun("timer-only", { accepts: [], nextTimer: "2026-11-12T10:40:00.000Z" }),
      waitingRun("try-it", {
        kind: "test",
        approvals: [pendingApproval("call-1", "search", "T1")],
      }),
    ];
    expect(inboxItems(runs)).toEqual([]);
  });

  it("orders items from several runs by when they started waiting", () => {
    const items = inboxItems([
      waitingRun("old", { lastWaitingAt: "2026-11-10T09:00:00.000Z" }),
      waitingRun("new", { lastWaitingAt: "2026-11-10T11:00:00.000Z" }),
      waitingRun("tool", {
        approvals: [pendingApproval("call-1", "search", "2026-11-10T10:00:00.000Z")],
      }),
    ]);
    expect(items.map((item) => item.runId)).toEqual(["new", "tool", "old"]);
  });

  it("breaks a tie in time by key, the same in every locale", () => {
    const at = "2026-11-10T10:00:00.000Z";
    const items = inboxItems([
      waitingRun("b", { lastWaitingAt: at }),
      waitingRun("B", { lastWaitingAt: at }),
      waitingRun("a", { lastWaitingAt: at }),
    ]);
    expect(items.map((item) => item.runId)).toEqual(["B", "a", "b"]);
  });
});
