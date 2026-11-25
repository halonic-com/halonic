import { verifies } from "@halonicjs/testing-spec";
import type { ToolResult, ToolRunContext } from "@paperclipai/plugin-sdk";
import { describe, expect, test } from "vitest";
import { registerTaskTools, type TaskToolsApi } from "./task-tools.ts";

type Handler = (params: unknown, runCtx: ToolRunContext) => Promise<ToolResult>;

const runCtx: ToolRunContext = {
  agentId: "agent-tomas",
  runId: "run-1",
  companyId: "acme",
  projectId: "",
};

const task = { id: "task-16403", identifier: "HAL-16403", title: "B2 task tools" };

/** The task tools on a fake context holding HAL-16403, recording every call. */
function setUp() {
  const calls: string[] = [];
  const posted: { taskId: string; body: string; options: unknown }[] = [];
  const metrics: { name: string; value: number; tags: unknown }[] = [];
  const handlers = new Map<string, Handler>();
  const ctx = {
    tools: {
      register: (name: string, _declaration: unknown, fn: Handler) => handlers.set(name, fn),
    },
    issues: {
      get: async (id: string) => {
        calls.push(`get ${id}`);
        return id === task.id || id === task.identifier ? task : null;
      },
      createComment: async (taskId: string, body: string, _companyId: string, options: unknown) => {
        posted.push({ taskId, body, options });
        return { id: "comment-new" };
      },
    },
    metrics: {
      write: async (name: string, value: number, tags: unknown) => {
        metrics.push({ name, value, tags });
      },
    },
  } as unknown as TaskToolsApi;
  registerTaskTools(ctx);
  const call = async (name: string, params: unknown) => {
    const handler = handlers.get(name);
    if (handler === undefined) throw new Error(`${name} isn't registered`);
    return handler(params, runCtx);
  };
  return { call, calls, posted, metrics };
}

verifies("paperclip.task-tools", () => {
  describe("comment", () => {
    test("posts as the calling agent and changes nothing else", async () => {
      const { call, posted } = setUp();
      const result = await call("comment", {
        task: "HAL-16403",
        body: "PR #5500 is out of draft.",
      });
      expect(result).toEqual({
        content:
          "Posted comment comment-new on HAL-16403, as you. It wakes nobody: to hand the task on, assign it.",
        data: { task: "HAL-16403", commentId: "comment-new" },
      });
      expect(posted).toEqual([
        {
          taskId: "task-16403",
          body: "PR #5500 is out of draft.",
          options: { authorAgentId: "agent-tomas" },
        },
      ]);
    });
  });

  test.each([
    [
      "comment",
      { task: "16403", body: "Hello." },
      "task must be a task identifier, such as HAL-16403, or its id.",
    ],
    ["comment", { task: "HAL-16403", body: "  " }, "body must be the comment's text."],
    [
      "comment",
      { task: "HAL-16403", body: "x".repeat(20_001) },
      "body is 20001 characters; the most is 20000. Put a longer text in a document.",
    ],
  ])("%s refuses %j before it reads or posts anything", async (name, params, message) => {
    const { call, calls, posted } = setUp();
    expect(await call(name, params)).toEqual({ error: `${name}: ${message}` });
    expect(calls).toEqual([]);
    expect(posted).toEqual([]);
  });

  test("counts each call with its tool and outcome", async () => {
    const { call, posted, metrics } = setUp();
    await call("comment", { task: "HAL-16403", body: "Hello." });
    const missing = await call("comment", { task: "HAL-99999", body: "Hello." });
    expect(missing.error).toBe(
      "comment: no task HAL-99999 in this company, or the plugin may not read it.",
    );
    expect(posted.map(({ taskId }) => taskId)).toEqual(["task-16403"]);
    expect(metrics).toEqual([
      {
        name: "tools.calls",
        value: 1,
        tags: { companyId: "acme", tool: "comment", outcome: "ok" },
      },
      {
        name: "tools.calls",
        value: 1,
        tags: { companyId: "acme", tool: "comment", outcome: "error" },
      },
    ]);
  });
});
