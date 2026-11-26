import {
  type RunEvent,
  type RunEventBody,
  type RunFailureCause,
  type RunSummary,
  summarize,
} from "@halonicjs/events";
import type { RunExecutor, RunStore } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import type { Server } from "./api.ts";
import { memoryRunOwnership } from "./memory-run-ownership.test-helper.ts";
import { ids, StubSessionVerifier } from "./stub-session-verifier.test-helper.ts";
import { testServer, unusedPort } from "./test-server.ts";

const host = "deploy.acme.example";
const stop: RunFailureCause = {
  kind: "limit_reached",
  code: "plan.cost",
  detail: { unit: "cost", used: "10", limit: "10", resetsAt: "2026-12-01T00:00:00.000Z" },
};
/** What the engine refused and decides again on `continue`: for the engine only. */
const refusedInput = { type: "effect-done", callId: "call-1", text: "the refused step's input" };
const waitingAtLimit: RunEventBody = {
  type: "run.limit-waiting",
  state: "reply",
  error: "Plan limit reached: 10 of 10 EUR used.",
  cause: stop,
  until: "2026-12-02T07:00:00.000Z",
  input: refusedInput,
};

/** The summary the run store keeps for `runId`'s log: `run.started`, then `bodies`. */
function summaryOf(runId: string, ...bodies: RunEventBody[]): RunSummary {
  const started: RunEventBody = {
    type: "run.started",
    hubId: "acme",
    workflowId: "reply",
    input: {},
    kind: "run",
    definitionsVersion: "v1",
  };
  const events: RunEvent[] = [started, ...bodies].map((body, index) => ({
    runId,
    seq: index + 1,
    at: `2026-11-25T09:0${index}:00.000Z`,
    ...body,
  }));
  const summary = summarize(events);
  if (summary === null) throw new Error("expected a summary");
  return summary;
}

/** Alice's two runs: one waiting at her plan's cost limit, one that failed when its wait ran out. */
function setup(): Server {
  const runs = new Map([
    ["run_waiting", summaryOf("run_waiting", waitingAtLimit)],
    [
      "run_failed",
      summaryOf("run_failed", waitingAtLimit, {
        type: "run.failed",
        state: "reply",
        error: "Plan limit reached: 10 of 10 EUR used.",
        reason: "budget",
        cause: stop,
      }),
    ],
  ]);
  const runStore = {
    get: async (runId: string) => runs.get(runId) ?? null,
    list: async () => [...runs.values()].filter((run) => run.status === "waiting"),
  } as unknown as Pick<RunStore, "get" | "list">;
  const ownership = memoryRunOwnership({
    run_waiting: { startedBy: ids.alice, visibility: "private" },
    run_failed: { startedBy: ids.alice, visibility: "private" },
  });
  return testServer({
    passwordHash: null,
    runs: unusedPort("the unscoped runs"),
    runStore: unusedPort("the unscoped run store"),
    secrets: unusedPort("secrets"),
    trust: { check: async () => ({ state: "trusted", message: "Trusted." }) },
    config: { allowedHosts: [host], maxBodyBytes: 4096 },
    manyUsers: {
      verifier: new StubSessionVerifier({
        "alice-token": { aud: "app", sub: ids.alice, scope: `o/${ids.acme}`, role: "member" },
      }),
      cookieName: "acme-session",
      scopedRuns: () => ({
        runs: unusedPort<RunExecutor>("the executor"),
        runStore,
        ownership,
      }),
    },
  });
}

/** Alice's `GET` of `path`, and the answer's text. */
async function read(server: Server, path: string): Promise<{ status: number; text: string }> {
  const answer = await server.handle(
    new Request(`https://${host}${path}`, {
      headers: { host, authorization: "Bearer alice-token" },
    }),
  );
  return { status: answer.status, text: await answer.text() };
}

describe("an end user's run at a plan limit", () => {
  verifies("server.end-user-run-limit", () => {
    it("carries the stop's code and detail while the run waits, never the refused input", async () => {
      const { status, text } = await read(setup(), "/api/runs/run_waiting");
      expect(status).toBe(200);
      expect(JSON.parse(text)).toMatchObject({
        status: "waiting",
        accepts: ["continue"],
        limit: stop,
      });
      expect(text).not.toContain("the refused step's input");
      expect(text).not.toContain("call-1");
    });

    it("lists the waiting run with its stop, never the refused input", async () => {
      const { status, text } = await read(setup(), "/api/waiting-runs");
      expect(status).toBe(200);
      const { runs } = JSON.parse(text) as { runs: RunSummary[] };
      expect(runs.map((run) => [run.id, run.limit])).toEqual([["run_waiting", stop]]);
      expect(text).not.toContain("the refused step's input");
    });

    it("carries the failure's cause once the wait ran out", async () => {
      const { status, text } = await read(setup(), "/api/runs/run_failed");
      expect(status).toBe(200);
      expect(JSON.parse(text)).toMatchObject({ status: "failed", reason: "budget", cause: stop });
      expect(text).not.toContain("the refused step's input");
    });
  });
});
