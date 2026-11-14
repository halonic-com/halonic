import type { Coordination, RunExecutor } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import type { Server, TrustGate } from "./api.ts";
import { FakeCoordination, FakePasswordHasher, TestClock, testServer } from "./test-server.ts";

class CountingGate implements TrustGate {
  checks = 0;
  async check() {
    this.checks += 1;
    return { state: "trusted" as const, message: "Trusted." };
  }
}

function setup() {
  const clock = new TestClock();
  const started: unknown[] = [];
  const runs = {
    start: async (request: unknown) => {
      started.push(request);
      return { runId: "run_1" };
    },
    startAgent: async (request: unknown) => {
      started.push(request);
      return { runId: "run_1" };
    },
  } as unknown as RunExecutor;
  const gate = new CountingGate();
  const server: Server = testServer({
    passwordHash: null,
    clock,
    runs,
    trust: gate,
    passwordHasher: new FakePasswordHasher(),
    coordination: new FakeCoordination(clock) as unknown as Coordination,
    config: { allowedHosts: ["localhost"] },
  });
  return { server, started, gate };
}

function post(server: Server, path: string, body: unknown): Promise<Response> {
  return server.handle(
    new Request(`http://localhost${path}`, {
      method: "POST",
      headers: { host: "localhost", "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

const workflowStart = { hubId: "acme", workflowId: "triage", input: {} };
const agentStart = { hubId: "acme", agentId: "coder", prompt: "Fix it." };
const hostOnly = {
  harness: "codex",
  placement: "this-computer",
  sandbox: "none",
  profile: { network: "open" },
  workingFolder: "/",
  allowedSites: ["*"],
};

describe("harness agents run on the host", () => {
  verifies("server.harness-on-host", () => {
    for (const [field, value] of Object.entries(hostOnly)) {
      it(`refuses a workflow start that names ${field}, before the gate`, async () => {
        const { server, started, gate } = setup();
        const response = await post(server, "/api/runs", { ...workflowStart, [field]: value });
        expect(response.status).toBe(400);
        expect(((await response.json()) as { code: string }).code).toBe("bad_request");
        expect(started).toEqual([]);
        expect(gate.checks).toBe(0);
      });

      it(`refuses an agent start that names ${field}, before the gate`, async () => {
        const { server, started, gate } = setup();
        const response = await post(server, "/api/agent-runs", { ...agentStart, [field]: value });
        expect(response.status).toBe(400);
        expect(started).toEqual([]);
        expect(gate.checks).toBe(0);
      });
    }

    it("passes the executor only the validated fields of a start", async () => {
      const { server, started, gate } = setup();
      await post(server, "/api/runs", { ...workflowStart, runId: "try-1", note: "x" });
      await post(server, "/api/agent-runs", { ...agentStart, note: "x", kind: "test" });
      expect(started).toEqual([{ ...workflowStart, runId: "try-1" }, agentStart]);
      expect(gate.checks).toBe(2);
    });
  });
});
