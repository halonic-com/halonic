import { type Coordination, type RunExecutor, RunTargetNotFound } from "@halonicjs/ports";
import { typeTest, verifies } from "@halonicjs/testing-spec";
import { describe, expect, expectTypeOf, it } from "vitest";
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

function fakeRuns(failure?: Error) {
  const started: unknown[] = [];
  const summary = { runId: "run_1" };
  const runs = {
    start: async (request: unknown) => {
      started.push(request);
      if (failure !== undefined) throw failure;
      return summary;
    },
    startAgent: async (request: unknown) => {
      started.push(request);
      if (failure !== undefined) throw failure;
      return summary;
    },
  } as unknown as RunExecutor;
  return { runs, started };
}

function setup(gate: TrustGate, passwordHash: string | null = null, failure?: Error) {
  const clock = new TestClock();
  const { runs, started } = fakeRuns(failure);
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

async function signInCookie(server: Server): Promise<string> {
  // With no password there is nothing to sign in to, and the form carries no cookie.
  const response = await post(server, "/api/login", { password: "secret" });
  return (response.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
}

const workflowStart = { hubId: "hub", workflowId: "triage", input: { subject: "hi" } };
const agentStart = { hubId: "hub", agentId: "coder", prompt: "Fix it." };

const formTypes = [
  "application/x-www-form-urlencoded",
  "multipart/form-data; boundary=x",
  "text/plain",
  "",
];
const starts = [
  ["/api/runs", workflowStart],
  ["/api/agent-runs", agentStart],
] as const;

/** What a page on another site can send: JSON-shaped text in a form type, no `Origin`. */
function formPost(
  server: Server,
  path: string,
  start: unknown,
  type: string,
  cookie?: string,
): Promise<Response> {
  const headers: Record<string, string> = { host: "localhost" };
  if (type !== "") headers["content-type"] = type;
  if (cookie) headers["cookie"] = cookie;
  return server.handle(
    new Request(`http://localhost${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(start),
    }),
  );
}

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

    it("passes a runId through, so a client retry doesn't start a second run", async () => {
      const { server, started } = setup(new ScriptedGate([trusted]));
      await post(server, "/api/runs", { ...workflowStart, runId: "try-1" });
      await post(server, "/api/agent-runs", { ...agentStart, runId: "try-2" });
      expect(started).toEqual([
        { ...workflowStart, runId: "try-1" },
        { ...agentStart, runId: "try-2" },
      ]);
    });

    it("refuses a runId that isn't a short, non-empty string with 400 before the gate", async () => {
      const gate = new ScriptedGate([trusted]);
      const { server, started } = setup(gate);
      for (const runId of ["", 3, null, "x".repeat(257)]) {
        expect((await post(server, "/api/runs", { ...workflowStart, runId })).status).toBe(400);
        expect((await post(server, "/api/agent-runs", { ...agentStart, runId })).status).toBe(400);
      }
      expect(gate.checks).toBe(0);
      expect(started).toEqual([]);
    });

    typeTest("gives the server's gate port only a read method", () => {
      expectTypeOf<keyof TrustGate>().toEqualTypeOf<"check">();
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

    it.each([
      ["hub", "/api/runs", workflowStart],
      ["workflow", "/api/runs", workflowStart],
      ["hub", "/api/agent-runs", agentStart],
      ["agent", "/api/agent-runs", agentStart],
    ] as const)(
      "answers 404 when the %s of a start at %s doesn't exist",
      async (kind, path, body) => {
        const secret = "secret-name-in-the-message";
        const { server } = setup(
          new ScriptedGate([trusted]),
          null,
          new RunTargetNotFound(kind, "x", secret),
        );
        const response = await post(server, path, body);
        expect(response.status).toBe(404);
        const text = await response.text();
        expect(JSON.parse(text)).toEqual({
          code: "run_target_not_found",
          message: "There is no such hub, workflow or agent to run.",
        });
        expect(text).not.toContain(secret);
      },
    );

    it("keeps any other failure of a start a 500", async () => {
      const { server } = setup(new ScriptedGate([trusted]), null, new RangeError("odd"));
      expect((await post(server, "/api/runs", workflowStart)).status).toBe(500);
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

    it("refuses a cross-site form POST with no Origin before it asks the gate, with and without a password", async () => {
      for (const passwordHash of [null, "hash:secret"]) {
        const gate = new ScriptedGate([trusted]);
        const { server, started } = setup(gate, passwordHash);
        const cookie = await signInCookie(server);
        for (const type of formTypes) {
          for (const [path, start] of starts) {
            const response = await formPost(server, path, start, type, cookie);
            expect(response.status).toBe(415);
            expect(((await response.json()) as { code: string }).code).toBe(
              "unsupported_media_type",
            );
          }
        }
        expect(gate.checks).toBe(0);
        expect(started).toEqual([]);
      }
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
