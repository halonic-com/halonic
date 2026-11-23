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

const agents = [
  { id: "agent-tomas", name: "Tomas" },
  { id: "agent-liam", name: "Liam" },
];

const task = {
  id: "task-16403",
  identifier: "HAL-16403",
  title: "B2 task tools",
  status: "in_progress",
  priority: "medium",
  assigneeAgentId: "agent-tomas",
  assigneeUserId: null,
  parentId: "task-16355",
  description: "Build task_get and comment.",
  monitorNextCheckAt: null,
};
const parent = { ...task, id: "task-16355", identifier: "HAL-16355", parentId: null };
const blocker = { id: "task-16194", identifier: "HAL-16194", status: "done" };

function comment(minute: number, body = `Comment at minute ${minute}.`) {
  return {
    id: `comment-${minute}`,
    authorAgentId: minute % 2 === 0 ? "agent-tomas" : null,
    authorUserId: minute % 2 === 0 ? null : "user-board",
    createdAt: new Date(`2026-11-23T14:${String(minute).padStart(2, "0")}:00Z`),
    body,
  };
}

/** The task tools on a fake context holding HAL-16403 and its parent, recording every call. */
function setUp(comments = [1, 2, 3, 4, 5, 6, 7].map((minute) => comment(minute))) {
  const calls: string[] = [];
  const posted: { taskId: string; body: string; options: unknown }[] = [];
  const metrics: { name: string; value: number; tags: unknown }[] = [];
  const handlers = new Map<string, Handler>();
  const tasks = [task, parent];
  const ctx = {
    tools: {
      register: (name: string, _declaration: unknown, fn: Handler) => handlers.set(name, fn),
    },
    agents: { list: async () => agents },
    issues: {
      get: async (id: string) => {
        calls.push(`get ${id}`);
        return tasks.find((one) => one.id === id || one.identifier === id) ?? null;
      },
      listComments: async () => comments,
      createComment: async (taskId: string, body: string, _companyId: string, options: unknown) => {
        posted.push({ taskId, body, options });
        return { id: "comment-new" };
      },
      relations: { get: async () => ({ blockedBy: [blocker], blocks: [] }) },
      documents: {
        list: async () => [
          { key: "plan", title: "Plan", updatedAt: new Date("2026-11-23T13:00:00Z") },
        ],
        get: async (_taskId: string, key: string) =>
          key === "plan" ? { key: "plan", body: "Step 1: build it." } : null,
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
  describe("task_get", () => {
    test("answers the task, its blockers, documents and newest 5 comments, oldest first", async () => {
      const { call } = setUp();
      const result = await call("task_get", { task: "HAL-16403" });
      expect(result.error).toBeUndefined();
      const text = result.content ?? "";
      expect(text.split("\n").slice(0, 2)).toEqual([
        'HAL-16403 "B2 task tools": in_progress, priority medium, held by Tomas.',
        "Parent: HAL-16355 (in_progress). Blocked by: HAL-16194 (done). Monitor: none.",
      ]);
      expect(text).toContain('Documents: plan "Plan" (updated 2026-11-23T13:00:00.000Z).');
      expect(text).toContain("Comments: the newest 5 of 7, oldest first.");
      expect(text).not.toContain("minute 2.");
      expect(text.indexOf("minute 3.")).toBeLessThan(text.indexOf("minute 7."));
      expect(text).toContain("--- Tomas at 2026-11-23T14:04:00.000Z (comment comment-4):");
      expect(text).toContain("--- board at 2026-11-23T14:07:00.000Z (comment comment-7):");
    });

    test("trims a long comment and says how much it left out", async () => {
      const { call } = setUp([comment(1, "x".repeat(2_500))]);
      const result = await call("task_get", { task: "HAL-16403", comments: 1 });
      expect(result.content).toContain(`${"x".repeat(2_000)}\n[… 500 more characters left out]`);
      expect(result.content).not.toContain("x".repeat(2_001));
    });

    test("reads the document asked for, and says when the task hasn't got it", async () => {
      const { call } = setUp();
      const found = await call("task_get", { task: "HAL-16403", document: "plan", comments: 0 });
      expect(found.content).toContain("Document plan:\nStep 1: build it.");
      expect(found.content).toContain("Comments: the newest 0 of 7, oldest first.");
      const missing = await call("task_get", { task: "HAL-16403", document: "spec" });
      expect(missing.content).toContain("The document asked for doesn't exist on this task.");
    });
  });

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
      "task_get",
      { task: "16403" },
      "task must be a task identifier, such as HAL-16403, or its id.",
    ],
    [
      "task_get",
      { task: "HAL-16403", comments: 21 },
      "comments must be a whole number from 0 to 20.",
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
    await call("task_get", { task: "HAL-16403" });
    const missing = await call("comment", { task: "HAL-99999", body: "Hello." });
    expect(missing.error).toBe(
      "comment: no task HAL-99999 in this company, or the plugin may not read it.",
    );
    expect(posted).toEqual([]);
    expect(metrics).toEqual([
      {
        name: "tools.calls",
        value: 1,
        tags: { companyId: "acme", tool: "task_get", outcome: "ok" },
      },
      {
        name: "tools.calls",
        value: 1,
        tags: { companyId: "acme", tool: "comment", outcome: "error" },
      },
    ]);
  });
});
