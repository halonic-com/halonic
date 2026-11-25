import type { RunSummary } from "@halonicjs/events";
import type { RunExecutor, RunStore } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import type { Server } from "./api.ts";
import { manyUserRouteTable } from "./many-user-routes.ts";
import type { ManyUserPorts, RunOwnership } from "./many-users-api.ts";
import { memoryRunOwnership } from "./memory-run-ownership.test-helper.ts";
import { describeRoutes, type RouteDescription } from "./route-table.ts";
import { ids, StubSessionVerifier } from "./stub-session-verifier.test-helper.ts";
import { testServer, unusedPort } from "./test-server.ts";

const host = "deploy.acme.example";
const carol = "eu_carolCCCCCCCCCCCCCCCC";
const orgScope = `o/${ids.acme}`;
const member = (sub: string, role: string) => ({ aud: "app", sub, scope: orgScope, role });

/** A run of the organisation, as the run store holds it. */
function run(id: string, status: RunSummary["status"] = "waiting"): RunSummary {
  return {
    id,
    hubId: "acme",
    workflowId: "review",
    kind: "workflow",
    status,
    startedAt: "2026-11-25T09:00:00.000Z",
    endedAt: null,
    cost: 0.25,
    reason: null,
    context: { secretInput: "only for alice" },
    approvals: [],
  } as unknown as RunSummary;
}

/** One organisation: Alice's private run, Alice's shared run, and Bob's own private run. */
function setup() {
  const runs = new Map([
    ["run_private", run("run_private")],
    ["run_shared", run("run_shared")],
    ["run_bob", run("run_bob")],
  ]);
  const owners: Record<string, RunOwnership> = {
    run_private: { startedBy: ids.alice, visibility: "private" },
    run_shared: { startedBy: ids.alice, visibility: "organisation" },
    run_bob: { startedBy: ids.bob, visibility: "private" },
  };
  const ownership = memoryRunOwnership(owners);
  const acted: string[] = [];
  const executor = {
    start: async (request: { runId: string }) => {
      acted.push(`start ${request.runId}`);
      const existing = runs.get(request.runId) ?? run(request.runId, "running");
      runs.set(request.runId, existing);
      return existing;
    },
    send: async (runId: string) => {
      acted.push(`send ${runId}`);
      return runs.get(runId);
    },
    cancel: async (runId: string) => {
      acted.push(`cancel ${runId}`);
      return runs.get(runId);
    },
  } as unknown as RunExecutor;
  const runStore = {
    get: async (runId: string) => runs.get(runId) ?? null,
    list: async () => [...runs.values()],
  } as unknown as Pick<RunStore, "get" | "list">;
  const manyUsers: ManyUserPorts = {
    verifier: new StubSessionVerifier({
      "alice-token": member(ids.alice, "member"),
      "bob-token": member(ids.bob, "member"),
      "carol-token": member(carol, "admin"),
    }),
    cookieName: "acme-session",
    scopedRuns: () => ({ runs: executor, runStore, ownership }),
  };
  const server = testServer({
    passwordHash: null,
    runs: unusedPort("the unscoped runs"),
    runStore: unusedPort("the unscoped run store"),
    secrets: unusedPort("secrets"),
    trust: { check: async () => ({ state: "trusted", message: "Trusted." }) },
    config: { allowedHosts: [host], maxBodyBytes: 4096 },
    manyUsers,
  });
  return { server, acted, ownership };
}

function call(server: Server, token: string, method: string, path: string, body?: unknown) {
  const json = body === undefined ? {} : { "content-type": "application/json" };
  return server.handle(
    new Request(`https://${host}${path}`, {
      method,
      headers: { host, authorization: `Bearer ${token}`, ...json },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
  );
}

/** Calls one declared route for one run: its path with the run id, and a body a start or an action takes. */
function callRoute(server: Server, token: string, route: RouteDescription, runId: string) {
  const path = route.path.replace(":runId", encodeURIComponent(runId));
  if (route.kind === "run-start") {
    const start = { hubId: "acme", workflowId: "review", agentId: "triage", prompt: "hi", runId };
    return call(server, token, route.method, path, start);
  }
  const body = route.method === "POST" ? { event: "approve" } : undefined;
  return call(server, token, route.method, path, body);
}

const routesOf = (...kinds: RouteDescription["kind"][]) =>
  describeRoutes(manyUserRouteTable).filter((route) => kinds.includes(route.kind));

describe("runs belong to whoever started them", () => {
  verifies("server.run-access", () => {
    it("answers another member's private run as not found on every run route", async () => {
      const { server, acted } = setup();
      const routes = routesOf("run-read", "run-write", "run-start");
      expect(routes.length).toBeGreaterThan(0);
      for (const route of routes) {
        const answer = await callRoute(server, "bob-token", route, "run_private");
        expect(answer.status, `${route.method} ${route.path}`).toBe(404);
        expect(JSON.stringify(await answer.json())).not.toContain("only for alice");
      }
      expect(acted).toEqual([]);
    });

    it("leaves the run's starter alone when another member starts with its id", async () => {
      const { server, ownership } = setup();
      await call(server, "bob-token", "POST", "/api/runs", {
        hubId: "acme",
        workflowId: "review",
        runId: "run_private",
      });
      expect(await ownership.get("run_private")).toEqual({
        startedBy: ids.alice,
        visibility: "private",
      });
    });

    it("lets a member read a shared run but not act on it", async () => {
      const { server, acted } = setup();
      for (const route of routesOf("run-read")) {
        const answer = await callRoute(server, "bob-token", route, "run_shared");
        expect(answer.status, `${route.method} ${route.path}`).not.toBe(404);
      }
      for (const route of routesOf("run-write")) {
        const answer = await callRoute(server, "bob-token", route, "run_shared");
        expect(answer.status, `${route.method} ${route.path}`).toBe(403);
      }
      expect(acted).toEqual([]);
    });

    it("shows an admin who started a private run and how it went, never its content", async () => {
      const { server, acted } = setup();
      const summary = await call(server, "carol-token", "GET", "/api/runs/run_private");
      expect(summary.status).toBe(200);
      const shown = (await summary.json()) as Record<string, unknown>;
      expect(shown).toMatchObject({ id: "run_private", startedBy: ids.alice, status: "waiting" });
      expect(shown).not.toHaveProperty("context");
      const events = await call(server, "carol-token", "GET", "/api/runs/run_private/events");
      expect(events.status).toBe(403);
      const answer = await call(server, "carol-token", "POST", "/api/runs/run_private/events", {
        event: "approve",
      });
      expect(answer.status).toBe(403);
      const cancel = await call(server, "carol-token", "POST", "/api/runs/run_private/cancel", {});
      expect(cancel.status).toBe(200);
      expect(acted).toEqual(["cancel run_private"]);
    });

    it("lets whoever started a run answer it", async () => {
      const { server, acted } = setup();
      const answer = await call(server, "alice-token", "POST", "/api/runs/run_private/events", {
        event: "approve",
      });
      expect(answer.status).toBe(200);
      expect(acted).toEqual(["send run_private"]);
    });

    it("lists only the member's own waiting runs", async () => {
      const { server } = setup();
      const list = await call(server, "alice-token", "GET", "/api/waiting-runs");
      const { runs } = (await list.json()) as { runs: RunSummary[] };
      expect(runs.map((listed) => listed.id)).toEqual(["run_private", "run_shared"]);
    });

    it("records whoever starts a new run as its starter before it starts", async () => {
      const { server, acted, ownership } = setup();
      const answer = await call(server, "bob-token", "POST", "/api/runs", {
        hubId: "acme",
        workflowId: "review",
      });
      expect(answer.status).toBe(200);
      const { id } = (await answer.json()) as RunSummary;
      expect(acted).toEqual([`start ${id}`]);
      expect(await ownership.get(id)).toEqual({ startedBy: ids.bob, visibility: "private" });
    });
  });
});

describe("a start's run id", () => {
  verifies("server.run-claim-id", () => {
    it("is refused before it is claimed when it is empty, too long or not text", async () => {
      const { server, acted, ownership } = setup();
      const tooLong = "r".repeat(257);
      for (const runId of ["", tooLong, 42]) {
        const start = { hubId: "acme", workflowId: "review", runId };
        const answer = await call(server, "bob-token", "POST", "/api/runs", start);
        expect(answer.status, JSON.stringify(runId)).toBe(400);
      }
      expect(await ownership.get("")).toBeNull();
      expect(await ownership.get(tooLong)).toBeNull();
      expect(acted).toEqual([]);
    });
  });
});

describe("a scope whose host records no run owners", () => {
  verifies("server.run-access", () => {
    it("lets no organisation member start, read or answer a run", async () => {
      const recorded: string[] = [];
      const executor = {
        start: async () => {
          recorded.push("start");
          return run("run_new", "running");
        },
      } as unknown as RunExecutor;
      const runStore = {
        get: async (runId: string) => (runId === "run_old" ? run("run_old") : null),
        list: async () => [run("run_old")],
      } as unknown as Pick<RunStore, "get" | "list">;
      const server = testServer({
        passwordHash: null,
        runs: unusedPort("the unscoped runs"),
        runStore: unusedPort("the unscoped run store"),
        secrets: unusedPort("secrets"),
        trust: { check: async () => ({ state: "trusted", message: "Trusted." }) },
        config: { allowedHosts: [host], maxBodyBytes: 4096 },
        manyUsers: {
          verifier: new StubSessionVerifier({ "alice-token": member(ids.alice, "member") }),
          cookieName: "acme-session",
          scopedRuns: () => ({ runs: executor, runStore }),
        },
      });
      const start = { hubId: "acme", workflowId: "review" };
      expect((await call(server, "alice-token", "POST", "/api/runs", start)).status).toBe(404);
      expect((await call(server, "alice-token", "GET", "/api/runs/run_old")).status).toBe(404);
      const list = await call(server, "alice-token", "GET", "/api/waiting-runs");
      expect(await list.json()).toEqual({ runs: [], agents: {} });
      expect(recorded).toEqual([]);
    });
  });
});
