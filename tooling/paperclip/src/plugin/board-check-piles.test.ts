import { verifies } from "@halonicjs/testing-spec";
import type { ToolResult, ToolRunContext } from "@paperclipai/plugin-sdk";
import { expect, test } from "vitest";
import { checkerTask, fakeBoardContext } from "./board-check.test-helper.ts";
import { boardCheck } from "./board-check.ts";
import { type BoardToolsApi, registerBoardTools } from "./board-tools.ts";
import { manifest } from "./manifest.ts";

const settings = {
  boardCheckerTask: checkerTask.id,
  boardCheckWritesForVersion: manifest.version,
};

const queued = (agentId: string, from: number, count: number) =>
  Array.from({ length: count }, (_, index) => ({
    id: `run-${agentId}-${from + index}`,
    agentId,
    status: "queued",
  }));

/** Mateo with six queued runs over three tasks, Priya with four, and a task with no run. */
const task = (number: number, runs: ReturnType<typeof queued>) => ({
  id: `task-${number}`,
  identifier: `HAL-${number}`,
  status: "todo",
  assigneeAgentId: runs[0]?.agentId ?? null,
  updatedAt: new Date("2026-11-22T10:00:00Z"),
  runs,
});
const tasks = [
  checkerTask,
  task(1, queued("agent-mateo", 0, 2)),
  task(2, queued("agent-mateo", 2, 2)),
  task(3, queued("agent-mateo", 4, 2)),
  task(4, queued("agent-priya", 0, 4)),
  task(5, []),
];

function setUp() {
  const fake = fakeBoardContext({ tasks, comments: {}, config: () => settings });
  return { ...fake, board: boardCheck(fake.ctx) };
}

verifies("paperclip.board-check-piles", () => {
  test("on the hour, names an agent with five or more queued runs once", async () => {
    const { board, sent, state } = setUp();
    await board.run(new Date("2026-11-22T14:00:00Z"));
    await board.run(new Date("2026-11-22T15:00:00Z"));
    expect(sent.filter((write) => write.call === "createComment")).toEqual([
      {
        call: "createComment",
        args: [
          checkerTask.id,
          "Queued runs piling up (5 or more for one agent): Mateo 6.\n\nBoard check (plugin)",
          "acme",
        ],
      },
    ]);
    expect(state.get("piles")).toMatchObject({ piles: [{ agentId: "agent-mateo", queued: 6 }] });
  });

  test("names the pile on the first hour after the board turns writes on, with the same queue", async () => {
    let config: Record<string, unknown> = { boardCheckerTask: checkerTask.id };
    const fake = fakeBoardContext({ tasks, comments: {}, config: () => config });
    const board = boardCheck(fake.ctx);
    await board.run(new Date("2026-11-22T14:00:00Z"));
    config = settings;
    await board.run(new Date("2026-11-22T15:00:00Z"));
    await board.run(new Date("2026-11-22T16:00:00Z"));
    const comments = fake.sent.filter((write) => write.call === "createComment");
    expect(comments).toHaveLength(1);
    expect(String(comments[0]?.args[1])).toContain("Mateo 6.");
  });

  test("reads no task's runs between the hours", async () => {
    const { board, state } = setUp();
    await board.run(new Date("2026-11-22T14:20:00Z"));
    expect(state.get("piles")).toBeUndefined();
  });

  test("failed_runs adds the piles as one line", async () => {
    const fake = setUp();
    await fake.board.run(new Date("2026-11-22T14:00:00Z"));
    type Handler = (params: unknown, runCtx: ToolRunContext) => Promise<ToolResult>;
    const handlers = new Map<string, Handler>();
    registerBoardTools({
      ...fake.ctx,
      tools: {
        register: (name: string, _declaration: unknown, fn: Handler) => handlers.set(name, fn),
      },
    } as unknown as BoardToolsApi);
    const result = await handlers.get("failed_runs")?.(
      {},
      { agentId: "agent-checker", runId: "run-1", companyId: "acme", projectId: "" },
    );
    expect(result?.content?.split("\n").at(-1)).toBe("Queued piles at 22 Nov 15:00 CET: Mateo 6.");
  });
});
