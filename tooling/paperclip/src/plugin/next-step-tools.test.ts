import { verifies } from "@halonicjs/testing-spec";
import type { PluginIssuesClient, ToolResult, ToolRunContext } from "@paperclipai/plugin-sdk";
import { describe, expect, test } from "vitest";
import { type NextStepToolsApi, registerNextStepTools } from "./next-step-tools.ts";

type DispositionPatch = Parameters<PluginIssuesClient["setDisposition"]>[2];
type DispositionResult = Awaited<ReturnType<PluginIssuesClient["setDisposition"]>>;
type Handler = (params: unknown, runCtx: ToolRunContext) => Promise<ToolResult>;

const runCtx: ToolRunContext = {
  agentId: "agent-tomas",
  runId: "run-1",
  companyId: "acme",
  projectId: "",
};

const agents = [
  { id: "agent-tomas", name: "Tomas", urlKey: "tomas" },
  { id: "agent-liam", name: "Liam", urlKey: "liam" },
];

const task = {
  id: "task-16403",
  identifier: "HAL-16403",
  status: "in_progress",
  monitorNextCheckAt: "2026-11-23T21:33:45.000Z",
};
const blocker = { id: "task-16989", identifier: "HAL-16989", status: "todo" };

const accepted = (body: unknown): DispositionResult => ({ ok: true, status: 200, body });

/** The tools on a fake context holding HAL-16403 and HAL-16989, recording every change sent. */
function setUp(answer = (patch: DispositionPatch) => accepted({ ...task, ...patch })) {
  const sent: { taskId: string; patch: DispositionPatch }[] = [];
  const metrics: { name: string; value: number; tags: unknown }[] = [];
  const handlers = new Map<string, Handler>();
  const ctx = {
    tools: {
      register: (name: string, _declaration: unknown, fn: Handler) => handlers.set(name, fn),
    },
    agents: { list: async () => agents },
    issues: {
      get: async (id: string) =>
        [task, blocker].find((one) => one.id === id || one.identifier === id) ?? null,
      setDisposition: async (taskId: string, _companyId: string, patch: DispositionPatch) => {
        sent.push({ taskId, patch });
        return answer(patch);
      },
    },
    metrics: {
      write: async (name: string, value: number, tags: unknown) => {
        metrics.push({ name, value, tags });
      },
    },
  } as unknown as NextStepToolsApi;
  registerNextStepTools(ctx, () => new Date("2026-11-23T14:00:00Z"));
  const call = async (name: string, params: unknown) => {
    const handler = handlers.get(name);
    if (handler === undefined) throw new Error(`${name} isn't registered`);
    return handler(params, runCtx);
  };
  return { call, sent, metrics };
}

verifies("paperclip.task-next-step", () => {
  describe("set_next_step", () => {
    test("in_progress sends the comment and a monitor, and answers the stored check", async () => {
      const { call, sent } = setUp((patch) =>
        accepted({
          ...task,
          status: "in_progress",
          monitorNextCheckAt: patch.monitor?.nextCheckAt,
        }),
      );
      const result = await call("set_next_step", {
        task: "HAL-16403",
        status: "in_progress",
        monitor: { inMinutes: 20, ref: "halonic-com/halonic#5486" },
        comment: "Pushed; CI runs.",
      });
      expect(result.content).toBe(
        "HAL-16403 is now in_progress; next monitor check: 2026-11-23T14:20:00.000Z. Your comment is posted.",
      );
      expect(sent).toEqual([
        {
          taskId: "task-16403",
          patch: {
            status: "in_progress",
            comment: "Pushed; CI runs.",
            monitor: {
              nextCheckAt: "2026-11-23T14:20:00.000Z",
              notes: "Set with set_next_step: every 20 minutes, at most 4 checks.",
              scheduledBy: "assignee",
              kind: "external_service",
              serviceName: "github",
              externalRef: "halonic-com/halonic#5486",
              timeoutAt: "2026-11-23T15:40:00.000Z",
              maxAttempts: 4,
            },
          },
        },
      ]);
    });

    test("blocked sends the blockers' ids and clears the monitor", async () => {
      const { call, sent } = setUp();
      await call("set_next_step", {
        task: "HAL-16403",
        status: "blocked",
        blockedBy: ["HAL-16989"],
        comment: "Waits on the server patch.",
      });
      expect(sent[0]?.patch).toEqual({
        status: "blocked",
        blockedByIssueIds: ["task-16989"],
        comment: "Waits on the server patch.",
        monitor: null,
      });
    });
  });

  describe("finish_run", () => {
    test("handoff sends todo, the next agent and a cleared monitor", async () => {
      const { call, sent } = setUp();
      await call("finish_run", {
        task: "HAL-16403",
        outcome: "handoff",
        to: "liam",
        comment: "Ready for review.",
      });
      expect(sent[0]?.patch).toEqual({
        status: "todo",
        assigneeAgentId: "agent-liam",
        comment: "Ready for review.",
        monitor: null,
      });
    });

    test("done sends done and the comment only", async () => {
      const { call, sent } = setUp();
      await call("finish_run", { task: "HAL-16403", outcome: "done", comment: "Merged, green." });
      expect(sent[0]?.patch).toEqual({ status: "done", comment: "Merged, green." });
    });

    test("refuses a handoff to the calling agent, before anything is sent", async () => {
      const { call, sent } = setUp();
      const result = await call("finish_run", {
        task: "HAL-16403",
        outcome: "handoff",
        to: "Tomas",
        comment: "Mine.",
      });
      expect(result.error).toBe(
        "finish_run: the task is already yours: to keep working, call set_next_step instead.",
      );
      expect(sent).toEqual([]);
    });
  });

  test("passes Paperclip's refusal on with its status, code and message", async () => {
    const { call } = setUp(() => ({
      ok: false,
      status: 422,
      body: { error: "No review path for in_review.", code: "invalid_issue_disposition" },
    }));
    const result = await call("finish_run", {
      task: "HAL-16403",
      outcome: "done",
      comment: "Done.",
    });
    expect(result.error).toBe(
      "finish_run: Paperclip refused (422) (invalid_issue_disposition): No review path for in_review.",
    );
  });

  test.each([
    [
      "set_next_step",
      { task: "HAL-16403", status: "in_progress", comment: "Working." },
      "in_progress needs a monitor: nothing else wakes you once this run ends.",
    ],
    [
      "set_next_step",
      { task: "HAL-16403", status: "in_progress", to: "Liam", comment: "Over to Liam." },
      "set_next_step never hands a task on: call finish_run with outcome handoff as your run's last step.",
    ],
    [
      "finish_run",
      { task: "HAL-16403", outcome: "blocked", blockedBy: ["HAL-99999"], comment: "Waiting." },
      "no task HAL-99999 in this company, or the plugin may not read it.",
    ],
    [
      "finish_run",
      { task: "HAL-16403", outcome: "handoff", to: "Nobody", comment: "Over." },
      "no agent named Nobody in this company.",
    ],
  ])("%s refuses %j and sends nothing", async (name, params, message) => {
    const { call, sent } = setUp();
    expect(await call(name, params)).toEqual({ error: `${name}: ${message}` });
    expect(sent).toEqual([]);
  });

  test("counts each call with its tool and outcome", async () => {
    const { call, metrics } = setUp();
    await call("finish_run", { task: "HAL-16403", outcome: "done", comment: "Done." });
    await call("set_next_step", { task: "HAL-16403", status: "todo", comment: "Hm." });
    expect(metrics.map((one) => one.tags)).toEqual([
      { companyId: "acme", tool: "finish_run", outcome: "ok" },
      { companyId: "acme", tool: "set_next_step", outcome: "error" },
    ]);
  });
});
