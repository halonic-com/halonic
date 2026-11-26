import { verifies } from "@halonicjs/testing-spec";
import type { ToolResult, ToolRunContext } from "@paperclipai/plugin-sdk";
import { describe, expect, test, vi } from "vitest";
import { type NextStepToolsApi, registerNextStepTools } from "./next-step-tools.ts";
import type { ReadyStep } from "./pr-write-tools.ts";

type Handler = (params: unknown, runCtx: ToolRunContext) => Promise<ToolResult>;

const runCtx: ToolRunContext = {
  agentId: "agent-priya",
  runId: "run-1",
  companyId: "acme",
  projectId: "",
};

const task = { id: "task-18983", identifier: "HAL-18983", status: "in_progress" };

/** `set_next_step` and `finish_run` with a fake ready step, recording the order of the steps. */
function setUp(ready: ReadyStep | undefined) {
  const steps: string[] = [];
  const handlers = new Map<string, Handler>();
  const ctx = {
    tools: { register: (name: string, _d: unknown, fn: Handler) => handlers.set(name, fn) },
    agents: {
      list: async () => [
        { id: "agent-priya", name: "Priya", urlKey: "priya" },
        { id: "agent-liam", name: "Liam", urlKey: "liam" },
      ],
    },
    issues: {
      get: async (id: string) => (id === task.identifier ? task : null),
      setDisposition: async (_id: string, _c: string, patch: { status: string }) => {
        steps.push(`task ${patch.status}`);
        return { ok: true, status: 200, body: { ...task, ...patch } };
      },
    },
    metrics: { write: async () => undefined },
  } as unknown as NextStepToolsApi;
  const tracked: ReadyStep | undefined =
    ready === undefined
      ? undefined
      : async (number, ctxOfRun) => {
          steps.push(`ready #${number}`);
          return ready(number, ctxOfRun);
        };
  registerNextStepTools(ctx, () => new Date("2026-11-26T10:00:00Z"), tracked);
  const call = (name: string, params: unknown) => {
    const handler = handlers.get(name);
    if (handler === undefined) throw new Error(`${name} isn't registered`);
    return handler(params, runCtx);
  };
  return { call, steps };
}

const handoff = { task: "HAL-18983", outcome: "handoff", to: "Liam", comment: "Ready for review." };

verifies("paperclip.pr-write-tool", () => {
  describe("the closing call", () => {
    test("finish_run with readyPr marks the pull request ready, then hands the task on", async () => {
      const { call, steps } = setUp(async (number) => `#${number} is marked ready.`);
      const result = await call("finish_run", { ...handoff, readyPr: 6400 });
      expect(steps).toEqual(["ready #6400", "task todo"]);
      expect(result.content).toMatch(/^#6400 is marked ready\. HAL-18983 is now todo/);
    });

    test("set_next_step with readyPr marks it ready, then sets the monitor", async () => {
      const { call, steps } = setUp(async (number) => `#${number} is marked ready.`);
      await call("set_next_step", {
        task: "HAL-18983",
        status: "in_progress",
        monitor: { inMinutes: 20, ref: "halonic-com/halonic#6400" },
        comment: "Marked ready, CI running.",
        readyPr: 6400,
      });
      expect(steps).toEqual(["ready #6400", "task in_progress"]);
    });

    test("a refused ready step leaves the task as it was", async () => {
      const refused = vi.fn(async () => {
        throw new Error("GitHub answered 403: Resource not accessible.");
      });
      const { call, steps } = setUp(refused);
      const result = await call("finish_run", { ...handoff, readyPr: 6400 });
      expect(result.error).toContain("403");
      expect(steps).toEqual(["ready #6400"]);
    });

    test("without readyPr, nothing reaches GitHub", async () => {
      const ready = vi.fn(async () => "");
      const { call } = setUp(ready);
      await call("finish_run", handoff);
      expect(ready).not.toHaveBeenCalled();
    });

    test("readyPr that isn't a pull request number is refused before anything changes", async () => {
      const { call, steps } = setUp(async () => "");
      const result = await call("finish_run", { ...handoff, readyPr: "6400; rm" });
      expect(result.error).toContain("readyPr must be a whole number");
      expect(steps).toEqual([]);
    });
  });
});
