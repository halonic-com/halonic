import type { Coordination, RunExecutor } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import type { Server, TrustDecision, TrustGate } from "./api.ts";
import { FakeCoordination, FakePasswordHasher, TestClock, testServer } from "./test-server.ts";

const trusted: TrustDecision = { state: "trusted", message: "Trusted." };

class ScriptedGate implements TrustGate {
  checks = 0;
  readonly decisions: Array<TrustDecision | Error>;
  constructor(decisions: Array<TrustDecision | Error>) {
    this.decisions = decisions;
  }
  async check(): Promise<TrustDecision> {
    this.checks += 1;
    const next = this.decisions[Math.min(this.checks, this.decisions.length) - 1];
    if (next === undefined || next instanceof Error) throw next ?? new Error("no decision");
    return next;
  }
}

function fakeRuns() {
  const started: unknown[] = [];
  const summary = { runId: "run_1" };
  const runs = {
    start: async (request: unknown) => {
      started.push(request);
      return summary;
    },
    startAgent: async (request: unknown) => {
      started.push(request);
      return summary;
    },
  } as unknown as RunExecutor;
  return { runs, started };
}

function setup(gate: TrustGate, passwordHash: string | null = null) {
  const clock = new TestClock();
  const { runs, started } = fakeRuns();
  const server: Server = testServer({
    passwordHash,
    clock,
    runs,
    trust: gate,
    passwordHasher: new FakePasswordHasher(),
    coordination: new FakeCoordination(clock) as unknown as Coordination,
    config: { allowedHosts: ["localhost"] },
  });
  return { server, started };
}

function post(server: Server, path: string, body: unknown, method = "POST"): Promise<Response> {
  return server.handle(
    new Request(`http://localhost${path}`, {
      method,
      headers: { host: "localhost", "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

const workflowStart = { hubId: "hub", workflowId: "triage", input: { subject: "hi" } };
const agentStart = { hubId: "hub", agentId: "coder", prompt: "Fix it." };

describe("trust gate", () => {
  verifies("server.trust-gate", () => {
    it("starts a workflow run and an agent run in a trusted workspace", async () => {
      const { server, started } = setup(new ScriptedGate([trusted]));
      const workflow = await post(server, "/api/runs", workflowStart);
      const agent = await post(server, "/api/agent-runs", agentStart);
      expect(workflow.status).toBe(200);
      expect(agent.status).toBe(200);
      expect(await workflow.json()).toEqual({ runId: "run_1" });
      expect(started).toEqual([workflowStart, agentStart]);
    });

    it.each(["new", "changed", "unreadable", "refused"] as const)(
      "refuses a %s workspace and starts nothing",
      async (state) => {
        const { server, started } = setup(new ScriptedGate([{ state, message: "No." }]));
        for (const [path, body] of [
          ["/api/runs", workflowStart],
          ["/api/agent-runs", agentStart],
        ] as const) {
          const response = await post(server, path, body);
          expect(response.status).toBe(403);
          expect(await response.json()).toEqual({
            code: "workspace_not_trusted",
            message: expect.any(String),
          });
        }
        expect(started).toEqual([]);
      },
    );

    it("asks again at every start, so a workspace changed since it was trusted starts nothing", async () => {
      const gate = new ScriptedGate([
        trusted,
        { state: "changed", message: "A connector changed." },
      ]);
      const { server, started } = setup(gate);
      expect((await post(server, "/api/runs", workflowStart)).status).toBe(200);
      expect((await post(server, "/api/runs", workflowStart)).status).toBe(403);
      expect(gate.checks).toBe(2);
      expect(started).toHaveLength(1);
    });

    it("counts a gate that throws as no trust: 500 and no run", async () => {
      const { server, started } = setup(new ScriptedGate([new Error("trust store gone")]));
      const response = await post(server, "/api/agent-runs", agentStart);
      expect(response.status).toBe(500);
      expect(JSON.stringify(await response.json())).not.toContain("trust store");
      expect(started).toEqual([]);
    });

    it("needs a sign-in before it asks the gate", async () => {
      const gate = new ScriptedGate([trusted]);
      const { server, started } = setup(gate, "hash:secret");
      const response = await server.handle(
        new Request("http://localhost/api/runs", {
          method: "POST",
          headers: { host: "localhost", "content-type": "application/json" },
          body: JSON.stringify(workflowStart),
        }),
      );
      expect(response.status).toBe(401);
      expect(gate.checks).toBe(0);
      expect(started).toEqual([]);
    });

    it("refuses a malformed start with 400 before it asks the gate", async () => {
      const gate = new ScriptedGate([trusted]);
      const { server, started } = setup(gate);
      for (const body of [{ hubId: "hub" }, { ...workflowStart, input: [] }, "text", null]) {
        expect((await post(server, "/api/runs", body)).status).toBe(400);
      }
      expect((await post(server, "/api/agent-runs", { hubId: "hub", agentId: 3 })).status).toBe(
        400,
      );
      expect(gate.checks).toBe(0);
      expect(started).toEqual([]);
    });

    it("shows the decision read-only and has no route that grants trust", async () => {
      const gate = new ScriptedGate([{ state: "new", message: "Never trusted here." }]);
      const { server, started } = setup(gate);
      const shown = await server.handle(
        new Request("http://localhost/api/trust", { headers: { host: "localhost" } }),
      );
      expect(await shown.json()).toEqual({ state: "new", message: "Never trusted here." });

      const attempts: Array<[string, string]> = [
        ["POST", "/api/trust"],
        ["PUT", "/api/trust"],
        ["DELETE", "/api/trust"],
        ["POST", "/api/trust/grant"],
        ["POST", "/api/runs/trust"],
        ["POST", "/api/workspace/trust"],
      ];
      for (const [method, path] of attempts) {
        const response = await post(server, path, { fingerprint: "hfp1:abc" }, method);
        expect(response.status).toBe(404);
      }
      expect(Object.keys(gate).includes("grant")).toBe(false);
      expect(started).toEqual([]);
    });
  });
});
