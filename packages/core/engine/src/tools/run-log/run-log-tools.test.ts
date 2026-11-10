import type { RunEvent, RunEventBody } from "@halonicjs/events";
import { fixedClock } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import type { HalonicTool } from "../../agent/turn-tools.ts";
import { KernelRuns } from "../../kernel/kernel-test-kit.test-helper.ts";
import { noRunsText, runLogTools, unknownRunText } from "./run-log-tools.ts";

const now = "2026-11-10T09:00:00.000Z";

/** Stores a run's log, each event a second after the one before. */
function storeRun(runs: KernelRuns, runId: string, startedAt: string, bodies: RunEventBody[]) {
  const start = Date.parse(startedAt);
  const events = bodies.map(
    (body, index): RunEvent => ({
      ...body,
      runId,
      seq: index + 1,
      at: new Date(start + index * 1000).toISOString(),
    }),
  );
  runs.logs.set(runId, events);
}

function started(hubId: string, workflowId = "invoices"): RunEventBody {
  return {
    type: "run.started",
    hubId,
    workflowId,
    input: {},
    kind: "run",
    definitionsVersion: "0".repeat(64),
  };
}

function toolsFor(runs: KernelRuns, runId?: string) {
  const options = { runs, clock: fixedClock(Date.parse(now), 0), hubId: "acme" };
  const [listRuns, readRun] = runLogTools(runId === undefined ? options : { ...options, runId });
  if (listRuns === undefined || readRun === undefined) {
    throw new Error("expected list_runs and read_run");
  }
  return { listRuns, readRun };
}

function call(tool: HalonicTool, args: Record<string, unknown> = {}): Promise<string> {
  return tool.run(args);
}

verifies("engine.run-log-tools", () => {
  describe("list_runs", () => {
    it("lists the hub's runs as lines, without other hubs' runs or the current run", async () => {
      const runs = new KernelRuns();
      storeRun(runs, "r-2", "2026-11-09T10:00:00.000Z", [
        started("acme"),
        { type: "state.entered", state: "draft" },
      ]);
      storeRun(runs, "r-1", "2026-11-09T08:00:00.000Z", [
        started("acme"),
        {
          type: "llm.response",
          agent: "clerk",
          provider: "acme-ai",
          model: "acme-1",
          usage: { inputTokens: 120, outputTokens: 30 },
          latencyMs: 400,
          text: "Done",
          cost: 0.0042,
        },
        { type: "run.failed", state: "draft", error: "The model was refused" },
      ]);
      storeRun(runs, "r-9", "2026-11-09T09:00:00.000Z", [started("globex")]);
      storeRun(runs, "r-now", "2026-11-10T08:59:00.000Z", [started("acme")]);

      const text = await call(toolsFor(runs, "r-now").listRuns);

      expect(text.split("\n")).toEqual([
        "r-2 | invoices | manual | running | 2026-11-09T10:00:00.000Z | - | 0+0 tokens | cost 0.0000 | ",
        "r-1 | invoices | manual | failed | 2026-11-09T08:00:00.000Z | 2s | 120+30 tokens | cost 0.0042 | The model was refused",
      ]);
    });

    it("filters by days back, workflow and status, and stops at the limit", async () => {
      const runs = new KernelRuns();
      storeRun(runs, "r-3", "2026-11-09T09:00:00.000Z", [started("acme", "refunds")]);
      storeRun(runs, "r-2", "2026-11-08T09:00:00.000Z", [started("acme")]);
      storeRun(runs, "r-1", "2026-10-01T09:00:00.000Z", [started("acme")]);
      const { listRuns } = toolsFor(runs);

      expect(await call(listRuns, { days: 1 })).toMatch(/^r-3 /);
      expect(await call(listRuns, { workflow: "invoices" })).toMatch(/^r-2 /);
      expect(await call(listRuns, { status: "completed" })).toBe(noRunsText);
      expect(await call(listRuns, { limit: 1 })).toMatch(/^r-3 [^\n]*$/);
      expect((await call(listRuns, { days: 90 })).split("\n")).toHaveLength(3);
    });

    it("counts unpriced calls next to the cost", async () => {
      const runs = new KernelRuns();
      storeRun(runs, "r-1", "2026-11-09T09:00:00.000Z", [
        started("acme"),
        {
          type: "llm.response",
          agent: "clerk",
          provider: "acme-ai",
          model: "acme-1",
          usage: { inputTokens: 1, outputTokens: 1 },
          latencyMs: 10,
          text: "",
        },
      ]);

      expect(await call(toolsFor(runs).listRuns)).toContain("cost 0.0000 (+1 unpriced)");
    });

    it.each([
      [{ days: 0 }, '"days" must be from 1 to 90 (got 0)'],
      [{ days: 1.5 }, '"days" must be a whole number (got 1.5)'],
      [{ limit: 201 }, '"limit" must be from 1 to 200 (got 201)'],
      [
        { status: "lost" },
        '"status" must be one of completed, failed, waiting, running (got "lost")',
      ],
      [{ workflow: 7 }, '"workflow" must be a string (got 7)'],
    ])("refuses %j, naming the argument", async (args, message) => {
      await expect(call(toolsFor(new KernelRuns()).listRuns, args)).rejects.toThrow(message);
    });
  });

  describe("read_run", () => {
    it("shows a run step by step, with long texts cut", async () => {
      const runs = new KernelRuns();
      storeRun(runs, "r-1", "2026-11-09T09:00:00.000Z", [
        started("acme"),
        { type: "state.entered", state: "review" },
        {
          type: "agent.started",
          state: "review",
          agent: "checker",
          prompt: "Check it",
          parent: "reviewer",
        },
        {
          type: "llm.response",
          agent: "checker",
          provider: "acme-ai",
          model: "acme-1",
          usage: { inputTokens: 10, outputTokens: 5 },
          latencyMs: 300,
          text: "",
          cost: 0.5,
        },
        { type: "tool.called", agent: "checker", tool: "lookup", args: { invoice: "INV-7" } },
        { type: "tool.result", agent: "checker", tool: "lookup", result: "x".repeat(250) },
        {
          type: "approval.requested",
          state: "review",
          agent: "checker",
          tool: "send",
          args: {},
          callId: "call-1",
          resume: { messages: [], calls: [], step: 0 },
        },
        {
          type: "approval.resolved",
          state: "review",
          agent: "checker",
          tool: "send",
          callId: "call-1",
          approved: false,
          comment: "Not yet",
        },
        { type: "run.waiting", state: "review", events: ["approve", "reject"] },
        { type: "context.updated", key: "note", value: "hidden" },
        { type: "run.completed", state: "done", context: {} },
      ]);

      const text = await call(toolsFor(runs).readRun, { runId: "r-1" });

      expect(text.split("\n")).toEqual([
        "state review",
        "  agent checker (for reviewer)",
        "  model acme-1: 10+5 tokens, cost 0.5000, 300 ms",
        '  tool lookup {"invoice":"INV-7"}',
        `    -> ${"x".repeat(200)}…`,
        "  waits for approval of send",
        "  rejected with comment",
        "waiting for approve, reject",
        "completed",
      ]);
    });

    it("answers that a run is unknown when it is missing or in another hub", async () => {
      const runs = new KernelRuns();
      storeRun(runs, "r-9", "2026-11-09T09:00:00.000Z", [started("globex")]);
      const { readRun } = toolsFor(runs);

      expect(await call(readRun, { runId: "r-9" })).toBe(unknownRunText);
      expect(await call(readRun, { runId: "r-404" })).toBe(unknownRunText);
      await expect(call(readRun, {})).rejects.toThrow('"runId" is required');
    });

    it("ends a failed run with its error", async () => {
      const runs = new KernelRuns();
      storeRun(runs, "r-1", "2026-11-09T09:00:00.000Z", [
        started("acme"),
        { type: "run.failed", state: null, error: "No model" },
      ]);

      expect(await call(toolsFor(runs).readRun, { runId: "r-1" })).toBe("failed: No model");
    });
  });
});
