import { verifies } from "@halonicjs/testing-spec";
import type { ToolResult, ToolRunContext } from "@paperclipai/plugin-sdk";
import { expect, test } from "vitest";
import { checkerTask, type FakeTaskComment, fakeBoardContext } from "./board-check.test-helper.ts";
import { type BoardToolsApi, readSince, registerBoardTools } from "./board-tools.ts";

type Handler = (params: unknown, runCtx: ToolRunContext) => Promise<ToolResult>;

const runCtx: ToolRunContext = {
  agentId: "agent-checker",
  runId: "run-1",
  companyId: "acme",
  projectId: "",
};
const task = {
  ...checkerTask,
  id: "task-16003",
  identifier: "HAL-16003",
  assigneeAgentId: "agent-mateo",
};

const comment = (
  id: string,
  minute: number,
  overrides: Partial<FakeTaskComment> = {},
): FakeTaskComment => ({
  id,
  authorType: "agent",
  authorAgentId: "agent-mateo",
  createdAt: new Date(`2026-11-22T13:${minute}:00Z`),
  body: "Text the tools never repeat.",
  ...overrides,
});

/** The board tools on a fake context whose plugin state holds `state`. */
function setUp(state: Record<string, unknown>, comments: Record<string, FakeTaskComment[]> = {}) {
  const fake = fakeBoardContext({
    tasks: [checkerTask, task],
    comments,
    config: () => ({ boardCheckerTask: checkerTask.id }),
  });
  for (const [key, value] of Object.entries(state)) {
    fake.state.set(key, value);
  }
  const handlers = new Map<string, Handler>();
  const ctx = {
    tools: {
      register: (name: string, _declaration: unknown, fn: Handler) => handlers.set(name, fn),
    },
    agents: fake.ctx.agents,
    issues: fake.ctx.issues,
    state: fake.ctx.state,
    config: fake.ctx.config,
    metrics: fake.ctx.metrics,
  } as unknown as BoardToolsApi;
  registerBoardTools(ctx);
  const call = (name: string, params: unknown) => handlers.get(name)?.(params, runCtx);
  return { call, metrics: fake.metrics };
}

const ask = (commentId: string, createdAt: string) => ({
  commentId,
  taskId: "task-16003",
  identifier: "HAL-16003",
  authorAgentId: "agent-mateo",
  createdAt,
});

verifies("paperclip.board-tools", () => {
  test("board_asks lists asks since a time, open or answered, with a link and no comment text", async () => {
    const { call } = setUp(
      {
        asks: [
          ask("comment-1", "2026-11-22T13:10:00.000Z"),
          ask("comment-2", "2026-11-22T13:40:00.000Z"),
        ],
      },
      {
        "task-16003": [
          comment("comment-1", 10),
          comment("answer", 20, { authorAgentId: "agent-checker" }),
          comment("comment-2", 40),
        ],
      },
    );
    const result = await call("board_asks", { since: "2026-11-22T13:00:00Z" });
    expect(result?.content).toBe(
      [
        "Board asks since 22 Nov 14:00 CET: 2. No comment text: open the link to read one.",
        "- HAL-16003, comment comment-2 by Mateo at 22 Nov 14:40 CET: open (/HAL/issues/HAL-16003#comment-comment-2)",
        "- HAL-16003, comment comment-1 by Mateo at 22 Nov 14:10 CET: answered (/HAL/issues/HAL-16003#comment-comment-1)",
      ].join("\n"),
    );
    expect(JSON.stringify(result)).not.toContain("never repeat");
  });

  test("failed_runs groups runs by agent with tasks and cause codes, and says since when it counts", async () => {
    const run = (runId: string, cause: string, agentId = "agent-mateo") => ({
      runId,
      agentId,
      taskId: "task-16003",
      cause,
      at: "2026-11-22T13:30:00.000Z",
    });
    const { call } = setUp({
      "failed-runs": {
        since: "2026-11-22T09:00:00.000Z",
        runs: [
          run("run-1", "timeout"),
          run("run-2", "no_identity"),
          run("run-3", "timeout", "agent-priya"),
        ],
        woken: [],
        reported: [],
      },
    });
    const result = await call("failed_runs", { since: "2026-11-21T14:00:00Z" });
    expect(result?.content).toBe(
      [
        "Failed and timed-out runs since 21 Nov 15:00 CET: 3. Counting since 22 Nov 10:00 CET; runs that failed while the plugin was down are missing.",
        "- Mateo: 2 (timeout 1, no_identity 1) on HAL-16003",
        "- Priya: 1 (timeout 1) on HAL-16003",
      ].join("\n"),
    );
  });

  test("refuses a since that isn't a time, and saves each call as a metric", async () => {
    const { call, metrics } = setUp({});
    expect(await call("failed_runs", { since: "yesterday" })).toEqual({
      error: "failed_runs: since must be an ISO time, such as 2026-11-22T12:00:00Z.",
    });
    expect(metrics).toEqual([
      {
        name: "tools.calls",
        value: 1,
        tags: { companyId: "acme", tool: "failed_runs", outcome: "error" },
      },
    ]);
    expect(readSince({}, new Date("2026-11-22T14:00:00Z"))).toEqual(
      new Date("2026-11-21T14:00:00Z"),
    );
  });
});
