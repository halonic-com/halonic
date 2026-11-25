import { verifies } from "@halonicjs/testing-spec";
import type { ToolResult, ToolRunContext } from "@paperclipai/plugin-sdk";
import { expect, test } from "vitest";
import { checkerTask, type FakeTask, fakeBoardContext } from "./board-check.test-helper.ts";
import { boardCheck } from "./board-check.ts";
import { type BoardToolsApi, registerBoardTools } from "./board-tools.ts";
import { manifest } from "./manifest.ts";

const at = (time: string) => new Date(`2026-11-22T${time}:00Z`);
const settings = { boardCheckerTask: checkerTask.id, boardCheckWritesForVersion: manifest.version };

const task = (number: number, overrides: Partial<FakeTask>): FakeTask => ({
  id: `task-${number}`,
  identifier: `HAL-${number}`,
  status: "in_progress",
  assigneeAgentId: "agent-mateo",
  updatedAt: at("10:00"),
  ...overrides,
});

const tasks = [
  checkerTask,
  task(2, {
    status: "blocked",
    assigneeUserId: "user-board",
    assigneeAgentId: null,
    title: "A title the board check never repeats",
    blockedTransitionAt: at("09:00"),
    blocks: ["task-4"],
  } as Partial<FakeTask>),
  task(3, { status: "in_review", pendingCards: 1 }),
  task(4, { status: "blocked", blocks: ["task-5"] }),
  task(5, { status: "todo" }),
];

function setUp() {
  const fake = fakeBoardContext({ tasks, comments: {}, config: () => settings });
  return { ...fake, board: boardCheck(fake.ctx) };
}

const documentWrites = (sent: { call: string; args: unknown[] }[]) =>
  sent.filter((write) => write.call === "documents.upsert");

verifies("paperclip.board-check-waiting", () => {
  test("lists what waits on the board on the hour, ranked by what it holds up, without titles", async () => {
    const { board, sent } = setUp();
    await board.run(at("14:00"));
    const writes = documentWrites(sent);
    expect(writes).toHaveLength(1);
    const { key, body } = (writes[0]?.args[0] ?? {}) as { key?: string; body?: string };
    expect(key).toBe("board-waiting");
    expect(body).toContain(
      "1. HAL-2: blocked on the board, holds up 2 tasks, waiting since 22 Nov 10:00 CET, held by the board",
    );
    expect(body).toContain(
      "2. HAL-3: board card pending, holds up 0 tasks, waiting since 22 Nov 11:00 CET, held by Mateo",
    );
    expect(body).not.toContain("HAL-4:");
    expect(body).not.toContain("A title");
  });

  test("leaves the document alone when nothing changed since the last hour", async () => {
    const { board, sent } = setUp();
    await board.run(at("14:00"));
    await board.run(at("15:00"));
    expect(documentWrites(sent)).toHaveLength(1);
  });

  test("writes the document on the first hour after the board turns writes on, with the same tasks", async () => {
    let writes: Record<string, unknown> = { boardCheckerTask: checkerTask.id };
    const fake = fakeBoardContext({ tasks, comments: {}, config: () => writes });
    const board = boardCheck(fake.ctx);
    await board.run(at("14:00"));
    expect(documentWrites(fake.sent)).toEqual([]);
    writes = settings;
    await board.run(at("15:00"));
    expect(documentWrites(fake.sent)).toHaveLength(1);
    await board.run(at("16:00"));
    expect(documentWrites(fake.sent)).toHaveLength(1);
  });

  test("doesn't look between the hours", async () => {
    const { board, sent, state } = setUp();
    await board.run(at("14:20"));
    expect(documentWrites(sent)).toEqual([]);
    expect(state.has("waiting")).toBe(false);
  });

  test("board_waiting answers with the last hourly list and its time", async () => {
    const fake = setUp();
    await fake.board.run(at("14:00"));
    let handler: ((params: unknown, runCtx: ToolRunContext) => Promise<ToolResult>) | undefined;
    registerBoardTools({
      ...fake.ctx,
      tools: {
        register: (name: string, _declaration: unknown, fn: typeof handler) => {
          handler = name === "board_waiting" ? fn : handler;
        },
      },
    } as unknown as BoardToolsApi);
    const runCtx = { agentId: "agent-checker", runId: "run-1", companyId: "acme", projectId: "" };
    const result = await handler?.({}, runCtx);
    expect(result?.content).toContain(
      "Waiting on the board as of 2026-11-22T14:00:00.000Z: 2 tasks",
    );
    expect(result?.content).toContain("1. HAL-2: blocked on the board, holds up 2 tasks");
  });
});
