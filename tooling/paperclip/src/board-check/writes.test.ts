import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import { type BoardWrite, type BoardWriteApi, commitWrites, type WriteGate } from "./writes.ts";

const checkerTask = "task-checker";

/** A gate for company acme whose switch answers from `switches`, one value per write (the last repeats). */
function setUp(switches: boolean[] = [true]) {
  const sent: { call: string; args: unknown[] }[] = [];
  const logs: string[] = [];
  const alerts: string[] = [];
  const api: BoardWriteApi = {
    issues: {
      createComment: async (...args: unknown[]) => {
        sent.push({ call: "createComment", args });
        return {} as never;
      },
      requestWakeup: async (...args: unknown[]) => {
        sent.push({ call: "requestWakeup", args });
        return { queued: true, runId: null };
      },
      documents: {
        upsert: async (input: unknown) => {
          sent.push({ call: "documents.upsert", args: [input] });
          return {} as never;
        },
      },
    },
  };
  let asked = 0;
  const gate: WriteGate = {
    companyId: "acme",
    boardCheckerTaskId: checkerTask,
    commentTasks: new Set([checkerTask]),
    writesOn: async () => switches[Math.min(asked++, switches.length - 1)] ?? false,
    log: (line) => logs.push(line),
    alert: async (why) => {
      alerts.push(why);
    },
  };
  return { api, gate, sent, logs, alerts };
}

const wake = (taskId: string): BoardWrite => ({
  kind: "wake",
  taskId,
  reason: "board_check_ask",
  key: `board-check ask ${taskId}`,
});
const comment: BoardWrite = { kind: "comment", taskId: checkerTask, body: "2 new approvals." };
const asksDocument: BoardWrite = { kind: "document", key: "board-asks", body: "# Board asks" };

verifies("paperclip.board-check-writes", () => {
  test("sends a comment, a named document and a wake-up through the three allowed calls", async () => {
    const { api, gate, sent } = setUp();
    const outcome = await commitWrites(api, gate, [comment, asksDocument, wake("task-7")]);
    expect(outcome).toEqual({ written: 3, logged: 0, refused: undefined });
    expect(sent).toEqual([
      {
        call: "createComment",
        args: [checkerTask, "2 new approvals.\n\nBoard check (plugin)", "acme"],
      },
      {
        call: "documents.upsert",
        args: [
          {
            issueId: checkerTask,
            key: "board-asks",
            body: "# Board asks",
            companyId: "acme",
            title: "Board asks",
            changeSummary: "Board check (plugin)",
          },
        ],
      },
      {
        call: "requestWakeup",
        args: [
          "task-7",
          "acme",
          { reason: "board_check_ask", idempotencyKey: "board-check ask task-7" },
        ],
      },
    ]);
  });

  test.each([
    ["a status change", { kind: "update", taskId: "task-7", patch: { status: "done" } }],
    ["a reassignment", { kind: "update", taskId: "task-7", patch: { assigneeAgentId: "a" } }],
    ["a blocker", { kind: "blockedBy", taskId: "task-7", blockedBy: ["task-8"] }],
    ["a label", { kind: "labels", taskId: "task-7", labelIds: ["label-1"] }],
    ["an approval decision", { kind: "approval", approvalId: "approval-1", action: "approve" }],
    ["another document", { kind: "document", key: "plan", body: "# Plan" }],
    ["a comment on another task", { kind: "comment", taskId: "task-7", body: "Hello." }],
    ["a wake-up without its reason", { kind: "wake", taskId: "task-7", reason: "x", key: "k" }],
  ])("refuses %s, writes nothing in that pass and raises the alert", async (_name, write) => {
    const { api, gate, sent, alerts } = setUp();
    const outcome = await commitWrites(api, gate, [comment, write as BoardWrite]);
    expect(outcome.refused).toBe("not_allowed");
    expect(sent).toEqual([]);
    expect(alerts).toEqual(["not_allowed"]);
  });

  test("writes nothing above 5 wake-ups, 5 comments or 2 document updates, and raises the alert", async () => {
    const sixWakes = ["1", "2", "3", "4", "5", "6"].map((n) => wake(`task-${n}`));
    const sixComments: BoardWrite[] = Array.from({ length: 6 }, () => comment);
    const threeDocuments: BoardWrite[] = [asksDocument, asksDocument, asksDocument];
    for (const plan of [sixWakes, sixComments, threeDocuments]) {
      const { api, gate, sent, alerts, logs } = setUp();
      expect((await commitWrites(api, gate, plan)).refused).toBe("over_ceiling");
      expect(sent).toEqual([]);
      expect(alerts).toEqual(["over_ceiling"]);
      expect(logs[0]).toMatch(/above the ceilings; wrote nothing/);
    }
  });

  test("sends a pass at exactly the ceilings", async () => {
    const { api, gate, sent } = setUp();
    const plan: BoardWrite[] = [
      ...["1", "2", "3", "4", "5"].map((n) => wake(`task-${n}`)),
      ...Array.from({ length: 5 }, () => comment),
      asksDocument,
      { kind: "document", key: "board-waiting", body: "# Waiting on the board" },
    ];
    expect((await commitWrites(api, gate, plan)).written).toBe(12);
    expect(sent).toHaveLength(12);
  });

  test("with the switch off, only logs each write by kind, target and size", async () => {
    const { api, gate, sent, logs } = setUp([false]);
    const outcome = await commitWrites(api, gate, [comment, asksDocument, wake("task-7")]);
    expect(outcome).toEqual({ written: 0, logged: 3, refused: undefined });
    expect(sent).toEqual([]);
    expect(logs).toEqual([
      "Board check: would comment on task task-checker (16 characters) (writes off).",
      "Board check: would update document board-asks (12 characters) (writes off).",
      "Board check: would wake task task-7 (board_check_ask) (writes off).",
    ]);
  });

  test("reads the switch before each write, so turning it off stops the next write", async () => {
    const { api, gate, sent } = setUp([true, false]);
    const outcome = await commitWrites(api, gate, [comment, asksDocument, wake("task-7")]);
    expect(outcome).toEqual({ written: 1, logged: 2, refused: undefined });
    expect(sent.map((write) => write.call)).toEqual(["createComment"]);
  });
});
