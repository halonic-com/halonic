import { type StepperCatalog, strictParameters } from "@halonicjs/action-steppers";
import type { RunEvent } from "@halonicjs/events";
import { fixedClock, fixedIds } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { MemoryTurnLog } from "../../agent/turn-test-kit.test-helper.ts";
import { maxActionRequestsPerRun, requestActionTool } from "./request-action-tool.ts";

const start = Date.parse("2026-11-28T09:00:00.000Z");

const catalog: StepperCatalog = {
  definition: (id, version) =>
    id === "acme.restart-app" && version === 1
      ? {
          id,
          version,
          service: "acme",
          title: id,
          summary: "Restarts an app.",
          risk: "routine",
          parameters: strictParameters({ app: { kind: "text", pattern: /^[a-z]{1,20}$/ } }),
          steps: [],
          targets: () => [{ service: "acme", kind: "app", name: "web" }],
          preview: () => [],
        }
      : undefined,
  stepType: () => undefined,
  browserOrigins: [],
  route: () => undefined,
};

const restart = {
  definition: "acme.restart-app",
  version: 1,
  parameters: { app: "web" },
  reason: "The web app stopped answering.",
};

/** The run's stored log, which holds what every model call of the run wrote to `log`. */
function storedRuns(log: MemoryTurnLog) {
  return {
    events: async (runId: string): Promise<RunEvent[]> =>
      log.events.map((event, index) => ({
        ...event,
        runId,
        seq: index + 1,
        at: new Date(start).toISOString(),
      })),
  };
}

/** The `request_action` of one model call of run `run-7`, which writes to `log`. */
function toolOfCall(log: MemoryTurnLog) {
  return requestActionTool({
    catalog,
    policy: { read: async () => ({ allowed: [] }) },
    source: { kind: "halonic", id: "halonic-server:https://acme.example" },
    runId: "run-7",
    agent: "ops",
    clock: fixedClock(start, 0),
    ids: fixedIds(),
    log,
    runs: storedRuns(log),
  });
}

function filedCount(log: MemoryTurnLog): number {
  return log.events.filter((event) => event.type === "action.requested").length;
}

verifies("engine.request-action-cap", () => {
  describe("request_action's cap per run", () => {
    it("files up to the cap, then refuses and writes nothing", async () => {
      const log = new MemoryTurnLog();
      const tool = toolOfCall(log);
      for (let filed = 0; filed < maxActionRequestsPerRun; filed++) {
        await expect(tool.run(restart)).resolves.toContain("Filed request");
      }
      await expect(tool.run(restart)).rejects.toThrow("the most one run may file");
      expect(filedCount(log)).toBe(10);
    });

    it("counts the requests of the run's earlier model calls", async () => {
      const log = new MemoryTurnLog();
      const earlier = toolOfCall(log);
      for (let filed = 0; filed < maxActionRequestsPerRun; filed++) await earlier.run(restart);
      const next = toolOfCall(log);
      await expect(next.run(restart)).rejects.toThrow("already filed 10 action requests");
      expect(filedCount(log)).toBe(10);
    });

    it("files calls made at once one at a time, so they don't pass the cap together", async () => {
      const log = new MemoryTurnLog();
      const tool = toolOfCall(log);
      const calls = Array.from({ length: 12 }, () => tool.run(restart));
      const outcomes = await Promise.allSettled(calls);
      expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(10);
      expect(outcomes.filter((outcome) => outcome.status === "rejected")).toHaveLength(2);
      expect(filedCount(log)).toBe(10);
    });
  });
});
