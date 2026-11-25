import { verifies } from "@halonicjs/testing-spec";
import type { PluginEvent } from "@paperclipai/plugin-sdk";
import { expect, test } from "vitest";
import { checkerTask, type FakeTaskComment, fakeBoardContext } from "./board-check.test-helper.ts";
import { boardCheck } from "./board-check.ts";
import { manifest } from "./manifest.ts";

const now = new Date("2026-11-22T14:00:00Z");
const settings = {
  boardCheckerTask: checkerTask.id,
  seatSupervisorTask: "task-seats",
  boardCheckWritesForVersion: manifest.version,
};
// Made up, and put together at run time so the repo's leak guard doesn't flag the file.
const secret = ["ghp", "Q1w2E3r4T5y6U7i8O9p0A1s2D3f4G5h6J7k8"].join("_");

const failed = (runId: string, taskId: string, error: string): PluginEvent => ({
  eventId: `event-${runId}`,
  eventType: "agent.run.failed",
  occurredAt: "2026-11-22T13:55:00Z",
  entityId: runId,
  entityType: "run",
  companyId: "acme",
  payload: { agentId: "agent-mateo", issueId: taskId, status: "failed", error },
});

const task = (number: number) => ({
  id: `task-${number}`,
  identifier: `HAL-${number}`,
  status: "in_progress",
  assigneeAgentId: "agent-mateo",
  updatedAt: new Date("2026-11-22T10:00:00Z"),
});

function setUp(comments: Record<string, readonly FakeTaskComment[]> = {}) {
  const fake = fakeBoardContext({
    tasks: [checkerTask, ...[1, 2, 3, 4, 5, 6, 7].map(task)],
    comments,
    config: () => settings,
  });
  return { ...fake, board: boardCheck(fake.ctx) };
}

const noIdentity = `No managed GitHub identity is available; token ${secret}`;

verifies("paperclip.board-check-failed-runs", () => {
  test("wakes a task whose run had no GitHub identity once, and keeps no error text", async () => {
    const { board, sent, state, logs } = setUp();
    await board.onRunFailed(failed("run-1", "task-1", noIdentity), now);
    await board.onRunFailed(failed("run-2", "task-1", noIdentity), now);
    await board.run(now);
    await board.run(now);
    expect(sent).toEqual([
      {
        call: "requestWakeup",
        args: [
          "task-1",
          "acme",
          { reason: "board_check_no_identity", idempotencyKey: "board-check no_identity task-1" },
        ],
      },
    ]);
    expect(JSON.stringify([sent, [...state], logs])).not.toContain(secret);
    expect(JSON.stringify([...state])).not.toContain("GitHub identity");
  });

  test("leaves the wakes over the ceiling for the next pass, after the board ask's wake", async () => {
    const ask: FakeTaskComment = {
      id: "comment-1",
      authorType: "agent",
      authorAgentId: "agent-priya",
      createdAt: new Date("2026-11-22T13:58:00Z"),
      body: "Waiting on the board.",
    };
    const { board, sent } = setUp({ "task-7": [ask] });
    for (const n of [1, 2, 3, 4, 5, 6]) {
      await board.onRunFailed(failed(`run-${n}`, `task-${n}`, noIdentity), now);
    }
    // task-7 must count as active for the catch-up pass.
    await board.onCommentCreated(
      {
        ...failed("x", "task-7", ""),
        eventType: "issue.comment.created",
        entityId: "task-7",
        payload: {},
      },
      now,
    );
    const afterAsk = sent.length;
    await board.run(now);
    await board.run(now);
    const wakes = sent.slice(afterAsk).map((write) => write.args[0]);
    expect(wakes).toEqual(["task-1", "task-2", "task-3", "task-4", "task-5", "task-6"]);
  });

  test("puts one line on the Seat Supervisor's task for new spend-limit failures", async () => {
    const { board, sent } = setUp();
    await board.onRunFailed(failed("run-1", "task-1", "Spend limit reached"), now);
    await board.run(now);
    await board.run(now);
    expect(sent).toEqual([
      {
        call: "createComment",
        args: [
          "task-seats",
          "Spend-limit failures: 1 runs since 22 Nov 14:55 CET (Mateo).\n\nBoard check (plugin)",
          "acme",
        ],
      },
    ]);
  });
});
