import { verifies } from "@halonicjs/testing-spec";
import type { PluginEvent } from "@paperclipai/plugin-sdk";
import { expect, test } from "vitest";
import {
  checkerTask,
  type FakeTask,
  type FakeTaskComment,
  fakeBoardContext,
} from "./board-check.test-helper.ts";
import { boardCheck } from "./board-check.ts";
import { manifest } from "./manifest.ts";

const now = new Date("2026-11-25T21:00:00Z");
const minutesAgo = (minutes: number) => new Date(now.getTime() - minutes * 60_000);

/** Chief's chat task, which the board names as the ask wake task (HAL-18857). */
const chiefChat: FakeTask = {
  id: "task-chief-chat",
  identifier: "HAL-18422",
  status: "in_progress",
  assigneeAgentId: "agent-chief",
  updatedAt: minutesAgo(30),
};

const task = (number: number): FakeTask => ({
  id: `task-${number}`,
  identifier: `HAL-${number}`,
  status: "in_progress",
  assigneeAgentId: "agent-mateo",
  updatedAt: minutesAgo(2),
});

const ask = (id: string, overrides: Partial<FakeTaskComment> = {}): FakeTaskComment => ({
  id,
  authorType: "agent",
  authorAgentId: "agent-mateo",
  createdAt: minutesAgo(2),
  body: "This needs the board's yes on the card.",
  ...overrides,
});

const commented = (taskId: string): PluginEvent => ({
  eventId: `event-${taskId}`,
  eventType: "issue.comment.created",
  occurredAt: now.toISOString(),
  entityId: taskId,
  entityType: "issue",
  companyId: "acme",
  payload: {},
});

function setUp(
  comments: Record<string, readonly FakeTaskComment[]>,
  config: Record<string, unknown>,
  commentsError?: Error,
) {
  const fake = fakeBoardContext({
    tasks: [checkerTask, chiefChat, task(16003), task(16004)],
    comments,
    config: () => ({ boardCheckWritesForVersion: manifest.version, ...config }),
    ...(commentsError === undefined ? {} : { commentsError }),
  });
  return { ...fake, board: boardCheck(fake.ctx) };
}

const toChief = { boardCheckerTask: checkerTask.id, boardAskWakeTask: chiefChat.id };

verifies("paperclip.board-check-ask-route", () => {
  test("wakes the wake task instead of the Board Checker and keeps board-asks on the checker's task", async () => {
    const { board, sent } = setUp({ "task-16003": [ask("comment-1")] }, toChief);
    await board.onCommentCreated(commented("task-16003"), now);
    expect(sent.map((write) => write.call)).toEqual(["documents.upsert", "requestWakeup"]);
    expect(sent[0]?.args[0]).toMatchObject({ issueId: "task-checker", key: "board-asks" });
    expect(sent[1]?.args).toEqual([
      "task-chief-chat",
      "acme",
      { reason: "board_check_ask", idempotencyKey: "board-check ask comment-1" },
    ]);
  });

  test("doesn't count the wake task holder's own comments as asks", async () => {
    const { board, sent } = setUp(
      {
        "task-16004": [
          ask("by-chief", { authorAgentId: "agent-chief", body: "The board card is up." }),
        ],
      },
      toChief,
    );
    await board.onCommentCreated(commented("task-16004"), now);
    await board.run(now);
    expect(sent.filter((write) => write.call !== "createComment")).toEqual([]);
  });

  test("keeps waking the Board Checker when the settings name no wake task", async () => {
    const { board, sent } = setUp(
      { "task-16003": [ask("comment-1")] },
      { boardCheckerTask: checkerTask.id },
    );
    await board.onCommentCreated(commented("task-16003"), now);
    expect(sent[1]?.args[0]).toBe("task-checker");
  });
});

verifies("paperclip.board-check-job-passes", () => {
  const jobPasses = (metrics: readonly { name: string }[]) =>
    metrics.filter((metric) => metric.name === "board_check.job_passes");

  test("saves one job pass per finished job pass", async () => {
    const { board, metrics } = setUp({}, { boardCheckerTask: checkerTask.id });
    await board.run(now);
    expect(jobPasses(metrics)).toEqual([
      { name: "board_check.job_passes", value: 1, tags: { companyId: "acme", trigger: "job" } },
    ]);
  });

  test("saves none for an event pass", async () => {
    const { board, metrics } = setUp(
      { "task-16003": [ask("comment-1")] },
      { boardCheckerTask: checkerTask.id },
    );
    await board.onCommentCreated(commented("task-16003"), now);
    expect(jobPasses(metrics)).toEqual([]);
  });

  test("saves none for a job pass that fails", async () => {
    const { board, metrics } = setUp(
      { "task-16003": [ask("comment-1")] },
      { boardCheckerTask: checkerTask.id },
      new Error("connection refused"),
    );
    await expect(board.run(now)).rejects.toThrow("couldn't be checked");
    expect(jobPasses(metrics)).toEqual([]);
  });
});
