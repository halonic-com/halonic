import { verifies } from "@halonicjs/testing-spec";
import type { Company, PluginEvent } from "@paperclipai/plugin-sdk";
import { createTestHarness } from "@paperclipai/plugin-sdk/testing";
import { describe, expect, test } from "vitest";
import {
  checkerTask,
  type FakeTask,
  type FakeTaskComment,
  fakeBoardContext,
} from "./board-check.test-helper.ts";
import { boardCheck } from "./board-check.ts";
import { manifest } from "./manifest.ts";
import { plugin } from "./worker.ts";

const now = new Date("2026-11-22T14:00:00Z");
const minutesAgo = (minutes: number) => new Date(now.getTime() - minutes * 60_000);
const writesOn = { boardCheckerTask: checkerTask.id, boardCheckWritesForVersion: manifest.version };

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
  config: Record<string, unknown> | undefined = writesOn,
  commentsError?: Error,
) {
  const fake = fakeBoardContext({
    tasks: [checkerTask, task(16003), task(16004), { ...task(14388), assigneeAgentId: null }],
    comments,
    config: () => config,
    ...(commentsError === undefined ? {} : { commentsError }),
  });
  return { ...fake, board: boardCheck(fake.ctx) };
}

verifies("paperclip.board-check-asks", () => {
  test("updates board-asks without the comment's text and wakes the Board Checker once", async () => {
    const { board, sent, state } = setUp({ "task-16003": [ask("comment-1")] });
    await board.onCommentCreated(commented("task-16003"), now);
    expect(sent.map((write) => write.call)).toEqual(["documents.upsert", "requestWakeup"]);
    const document = (sent[0]?.args[0] ?? {}) as { issueId: string; key: string; body: string };
    expect(document).toMatchObject({ issueId: "task-checker", key: "board-asks" });
    expect(document.body).toContain(
      "| HAL-16003 | comment-1 | Mateo | 22 Nov 14:58 CET | [open](/HAL/issues/HAL-16003#comment-comment-1) |",
    );
    expect(document.body).not.toContain("needs the board");
    expect(sent[1]?.args).toEqual([
      "task-checker",
      "acme",
      { reason: "board_check_ask", idempotencyKey: "board-check ask comment-1" },
    ]);
    expect(state.get("asks")).toEqual([
      {
        commentId: "comment-1",
        taskId: "task-16003",
        identifier: "HAL-16003",
        authorAgentId: "agent-mateo",
        createdAt: "2026-11-22T13:58:00.000Z",
      },
    ]);
  });

  test("writes nothing more for an ask it already handled", async () => {
    const { board, sent } = setUp({ "task-16003": [ask("comment-1")] });
    await board.onCommentCreated(commented("task-16003"), now);
    await board.onCommentCreated(commented("task-16003"), now);
    await board.run(now);
    expect(sent).toHaveLength(2);
  });

  test("finds asks on two tasks in one catch-up pass and wakes the Board Checker once", async () => {
    const { board, sent } = setUp({
      "task-16003": [ask("comment-1")],
      "task-16004": [
        ask("comment-2", {
          authorAgentId: "agent-priya",
          createdAt: minutesAgo(1),
          body: "Card is up.",
        }),
      ],
    });
    await board.run(now);
    // Newest first in the document.
    expect(sent.map((write) => write.call)).toEqual(["documents.upsert", "requestWakeup"]);
    expect(JSON.stringify(sent[0]?.args)).toMatch(/comment-2.*comment-1/);
  });

  test("skips the board, the plugin, the Board Checker, receipts, old comments and the Merger's requests", async () => {
    const { board, sent } = setUp({
      "task-16003": [
        ask("by-board", { authorType: "user", authorAgentId: null }),
        ask("by-plugin", { authorType: "system", authorAgentId: null }),
        ask("by-checker", { authorAgentId: "agent-checker" }),
        ask("receipt", { origin: "fast_response" }),
        ask("signed", { body: "Waiting on the board.\n\nBoard check (plugin)" }),
        ask("too-old", { createdAt: minutesAgo(13) }),
        ask("no-ask", { body: "CI is green." }),
      ],
      "task-14388": [ask("merger-request", { authorAgentId: "agent-merger" })],
    });
    await board.onCommentCreated(commented("task-16003"), now);
    await board.onCommentCreated(commented("task-14388"), now);
    expect(sent).toEqual([]);
  });

  test("counts the Merger's ask on another task", async () => {
    const { board, sent } = setUp({
      "task-16004": [ask("merger-ask", { authorAgentId: "agent-merger" })],
    });
    await board.run(now);
    expect(sent.map((write) => write.call)).toEqual(["documents.upsert", "requestWakeup"]);
  });

  test("reads and writes nothing for a company whose settings don't name the Board Checker's task", async () => {
    const { board, sent, state, logs } = setUp({ "task-16003": [ask("comment-1")] }, {});
    await board.run(now);
    await board.onCommentCreated(commented("task-16003"), now);
    expect([sent, [...state], logs]).toEqual([[], [], []]);
  });
});

verifies("paperclip.board-check-writes", () => {
  test.each([
    ["was just installed", { boardCheckerTask: checkerTask.id }],
    ["was upgraded", { ...writesOn, boardCheckWritesForVersion: "0.1.0" }],
  ])("only logs its writes after the plugin %s", async (_when, config) => {
    const { board, sent, logs } = setUp({ "task-16003": [ask("comment-1")] }, config);
    await board.onCommentCreated(commented("task-16003"), now);
    expect(sent).toEqual([]);
    expect(logs.map((log) => log.message)).toEqual([
      "Board check: 1 new board asks on HAL-16003.",
      expect.stringMatching(/^Board check: would update document board-asks \(\d+ characters\)/),
      "Board check: would wake task task-checker (board_check_ask) (writes off).",
    ]);
  });

  test("puts no comment or error text into writes, logs, metrics or saved state", async () => {
    // Made up, and put together at run time so the repo's leak guard doesn't flag the file.
    const secrets = [
      ["ghp", "Zx9QeLm4TfYv2KpR7sWb1HcN8dJ0aUo3iGq6"].join("_"),
      ["sk", "ant", "api03", "FAKEfake0000leaktest1111"].join("-"),
      "hunter2-made-up-password",
    ];
    const leaky = (id: string, secret: string) =>
      ask(id, { body: `For the board: the key is ${secret}. Board, please rotate it.` });
    const comments = {
      "task-16003": [leaky("comment-1", secrets[0] ?? "")],
      "task-16004": [leaky("comment-2", secrets[1] ?? "")],
    };
    const outputs: unknown[] = [];
    for (const config of [writesOn, { boardCheckerTask: checkerTask.id }]) {
      const run = setUp(comments, config);
      await run.board.onCommentCreated(commented("task-16003"), now);
      await run.board.run(now);
      outputs.push(run.sent, run.logs, run.metrics, [...run.state]);
    }
    const failing = setUp(comments, writesOn, new Error(`connection refused: ${secrets[2]}`));
    await expect(failing.board.run(now)).rejects.toThrow("couldn't be checked");
    outputs.push(failing.sent, failing.logs, failing.metrics);
    expect(failing.logs.map((log) => log.message)).toContain("Board check: couldn't run (Error).");
    const everything = JSON.stringify(outputs);
    expect(everything).toContain("comment-2");
    for (const secret of secrets) {
      expect(everything).not.toContain(secret);
    }
    expect(everything).not.toMatch(/rotate|the key is/);
  });

  test("never touches a call outside its allowlist, through the event and the job", async () => {
    const { ctx, board } = setUp({ "task-16003": [ask("comment-1")] });
    await board.onCommentCreated(commented("task-16003"), now);
    await board.run(now);
    // The guard itself: each of these throws the moment the board check would reach for it.
    const reach = ctx as unknown as Record<string, Record<string, unknown>>;
    expect(() => reach["issues"]?.["update"]).toThrow("touched issues.update");
    // Part (b) reads blocker links, so `relations` offers `get` alone; every relation write throws.
    const relations = reach["issues"]?.["relations"] as Record<string, unknown>;
    for (const write of ["setBlockedBy", "addBlockers", "removeBlockers"]) {
      expect(() => relations[write]).toThrow(`touched issues.relations.${write}`);
    }
    expect(() => reach["issues"]?.["createInteraction"]).toThrow(
      "touched issues.createInteraction",
    );
    expect(() => reach["issues"]?.["respondInteraction"]).toThrow(
      "touched issues.respondInteraction",
    );
    expect(() => reach["issues"]?.["create"]).toThrow("touched issues.create");
    // Part (d) lists pending approvals, so `approvals` offers `list` alone; deciding throws.
    expect(() => reach["approvals"]?.["decide"]).toThrow("touched approvals.decide");
    expect(() => reach["agents"]?.["pause"]).toThrow("touched agents.pause");
  });
});

describe("the board check", () => {
  test("runs as the board-check job and on each new comment, and skips a company without settings", async () => {
    const harness = createTestHarness({ manifest });
    harness.seed({ companies: [{ id: "acme" } as Company] });
    await plugin.definition.setup(harness.ctx);
    await harness.runJob("board-check");
    await harness.emit("issue.comment.created", {}, { companyId: "acme", entityId: "task-1" });
    expect(harness.logs.filter((log) => log.message.startsWith("Board check"))).toEqual([]);
  });

  test("saves its counts as metrics, tagged with what started the pass", async () => {
    const { board, metrics } = setUp({ "task-16003": [ask("comment-1")] });
    await board.onCommentCreated(commented("task-16003"), now);
    expect(metrics).toEqual([
      { name: "board_check.asks_new", value: 1, tags: { companyId: "acme", trigger: "event" } },
      { name: "board_check.writes", value: 2, tags: { companyId: "acme", trigger: "event" } },
      {
        name: "board_check.writes_logged",
        value: 0,
        tags: { companyId: "acme", trigger: "event" },
      },
    ]);
  });
});
