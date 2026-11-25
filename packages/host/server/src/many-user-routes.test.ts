import type { RunExecutor, RunStore } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, expectTypeOf, it } from "vitest";
import type { Server, ServerConfig, ServerPorts } from "./api.ts";
import { createServer } from "./create-server.ts";
import type { DeploymentPorts } from "./many-user-routes.ts";
import type { ManyUserPorts } from "./many-users-api.ts";
import { type Principal, scopeName } from "./principal.ts";
import type { SessionVerifier } from "./session-verifier.ts";
import { ids, personalClaims, StubSessionVerifier } from "./stub-session-verifier.test-helper.ts";
import { testServer, unusedPort } from "./test-server.ts";

const host = "deploy.acme.example";
const cookieName = "acme-session";

const stub = () =>
  new StubSessionVerifier({
    "alice-token": personalClaims(ids.alice, { client: "desktop" }),
    "bob-token": personalClaims(ids.bob),
    "acme-admin-token": { aud: "app", sub: ids.alice, scope: `o/${ids.acme}`, role: "admin" },
  });

/** A many-user server whose unscoped run ports, password and secrets fail the test if touched. */
function setup(verifier: SessionVerifier = stub()) {
  const scopedFor: string[] = [];
  const started: { scope: string; request: unknown }[] = [];
  const storedRuns = new Map([
    [`u/${ids.alice}`, [{ id: "run_alice", status: "waiting" }]],
    [`u/${ids.bob}`, [{ id: "run_bob", status: "waiting" }]],
  ]);
  const manyUsers: ManyUserPorts = {
    verifier,
    cookieName,
    scopedRuns(principal: Principal) {
      const scope = scopeName(principal.scope);
      scopedFor.push(scope);
      const stored = storedRuns.get(scope) ?? [];
      return {
        runs: {
          start: async (request: unknown) => {
            started.push({ scope, request });
            return { id: "run_new", status: "running" };
          },
        } as unknown as RunExecutor,
        runStore: {
          list: async () => stored,
          get: async (runId: string) => stored.find((run) => run.id === runId) ?? null,
        } as unknown as Pick<RunStore, "list" | "get">,
      };
    },
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
  return { server, scopedFor, started };
}

function call(
  server: Server,
  method: string,
  path: string,
  headers: Record<string, string> = {},
  body?: unknown,
): Promise<Response> {
  return server.handle(
    new Request(`https://${host}${path}`, {
      method,
      headers: {
        host,
        ...(body === undefined ? {} : { "content-type": "application/json" }),
        ...headers,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
  );
}

/** A JSON answer's fields, for a test that reads one of them. */
async function fieldsOf(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

describe("many-user server", () => {
  verifies("server.many-users", () => {
    it("answers the hello without a session, and needs one for every other route", async () => {
      const { server } = setup();
      expect((await call(server, "GET", "/api/hello")).status).toBe(200);
      const answers = await Promise.all([
        call(server, "GET", "/api/session"),
        call(server, "GET", "/api/waiting-runs", { authorization: "Basic abc" }),
        call(server, "GET", "/api/runs/run_alice", { cookie: `${cookieName}=nobody` }),
        call(server, "GET", "/api/session", {
          ...bearer("alice-token"),
          cookie: `${cookieName}=x`,
        }),
      ]);
      for (const answer of answers) {
        expect(answer.status).toBe(401);
        expect(await answer.json()).toEqual({ code: "not_signed_in", message: "Sign in first." });
      }
    });

    it("gives the session's scope and role, never its client, from a cookie or a bearer token", async () => {
      const { server } = setup();
      const expected = { signedIn: true, scope: `u/${ids.alice}`, role: "owner" };
      const fromBearer = await call(server, "GET", "/api/session", bearer("alice-token"));
      expect(await fromBearer.json()).toEqual(expected);
      const fromCookie = await call(server, "GET", "/api/session", {
        cookie: `${cookieName}=alice-token`,
      });
      expect(await fromCookie.json()).toEqual(expected);
      const admin = await call(server, "GET", "/api/session", bearer("acme-admin-token"));
      expect(await admin.json()).toEqual({ signedIn: true, scope: `o/${ids.acme}`, role: "admin" });
    });

    it("keeps each user's runs in their own scope", async () => {
      const { server, scopedFor } = setup();
      const aliceList = await call(server, "GET", "/api/waiting-runs", bearer("alice-token"));
      expect((await fieldsOf(aliceList))["runs"]).toEqual([{ id: "run_alice", status: "waiting" }]);
      const bobList = await call(server, "GET", "/api/waiting-runs", bearer("bob-token"));
      expect((await fieldsOf(bobList))["runs"]).toEqual([{ id: "run_bob", status: "waiting" }]);
      expect((await call(server, "GET", "/api/runs/run_bob", bearer("alice-token"))).status).toBe(
        404,
      );
      expect((await call(server, "GET", "/api/runs/run_alice", bearer("alice-token"))).status).toBe(
        200,
      );
      expect(scopedFor).toEqual([
        `u/${ids.alice}`,
        `u/${ids.bob}`,
        `u/${ids.alice}`,
        `u/${ids.alice}`,
      ]);
    });

    it("never takes a user id or scope from the address, a header or the body", async () => {
      const { server, started } = setup();
      const other = `u/${ids.bob}`;
      const start = { hubId: "acme", workflowId: "review", input: { scope: other, user: ids.bob } };
      const response = await call(
        server,
        "POST",
        `/api/runs?scope=${encodeURIComponent(other)}&user=${ids.bob}`,
        { ...bearer("alice-token"), "x-halonic-scope": other, "x-halonic-user": ids.bob },
        start,
      );
      expect(response.status).toBe(200);
      expect(started).toEqual([{ scope: `u/${ids.alice}`, request: start }]);
    });

    it("answers 404 for the password sign-in and every route that isn't a run route", async () => {
      const { server } = setup();
      const routes = [
        ["POST", "/api/login"],
        ["POST", "/api/logout"],
        ["GET", "/api/trust"],
        ["GET", "/api/workspace"],
        ["POST", "/api/webhooks/acme/nightly"],
        ["PUT", "/api/secrets/anthropic"],
        ["GET", "/api/google/setups"],
        ["POST", "/api/chat-turns"],
        ["POST", "/api/connector-calls"],
        ["GET", "/api/runs/run_alice/approvals"],
        ["GET", "/api/runs/run_alice/"],
      ] as const;
      for (const [method, path] of routes) {
        for (const headers of [{}, bearer("alice-token")]) {
          const answer = await call(
            server,
            method,
            path,
            headers,
            method === "GET" ? undefined : {},
          );
          expect(answer.status, `${method} ${path}`).toBe(404);
          expect((await fieldsOf(answer))["code"]).toBe("not_found");
        }
      }
    });

    it("keeps the Host and Origin checks, without a password", async () => {
      const { server } = setup();
      const otherHost = await server.handle(
        new Request("https://evil.example/api/session", {
          headers: { host: "evil.example", ...bearer("alice-token") },
        }),
      );
      expect(otherHost.status).toBe(421);
      const crossSite = await call(
        server,
        "POST",
        "/api/runs",
        { ...bearer("alice-token"), origin: "https://evil.example" },
        { hubId: "acme", workflowId: "review" },
      );
      expect(crossSite.status).toBe(403);
    });

    it("answers a verifier that throws with a server error, never as not signed in", async () => {
      const failing: SessionVerifier = {
        verify: async () => {
          throw new Error("the key store is down");
        },
      };
      const { server } = setup(failing);
      const answer = await call(server, "GET", "/api/session", bearer("alice-token"));
      expect(answer.status).toBe(500);
    });

    it("refuses to start with a session verifier made for tests", () => {
      const config: ServerConfig = {
        deploymentId: "acme",
        version: "0.1.0",
        minAppVersion: "0.1.0",
        allowedHosts: [host],
        maxBodyBytes: 1024,
      };
      const ports = { errorLog: { record: () => {} } } as unknown as ServerPorts;
      const real: SessionVerifier = { verify: async () => null };
      const manyUsers = (verifier: SessionVerifier): ManyUserPorts => ({
        verifier,
        cookieName,
        scopedRuns: unusedPort("scopedRuns"),
      });
      expect(() => createServer({ config, ports, manyUsers: manyUsers(stub()) })).toThrow(
        /made for tests/,
      );
      expect(() => createServer({ config, ports, manyUsers: manyUsers(real) })).not.toThrow();
    });

    it("gives the many-user routes no unscoped run ports", async () => {
      // The routes get run ports only from the per-principal factory: the type has no other way in.
      expectTypeOf<DeploymentPorts>().not.toHaveProperty("runs");
      expectTypeOf<DeploymentPorts>().not.toHaveProperty("runStore");
      expectTypeOf<DeploymentPorts>().not.toHaveProperty("secrets");
      expectTypeOf<Parameters<ManyUserPorts["scopedRuns"]>>().toEqualTypeOf<[Principal]>();
      // The unscoped runs, run store and secrets of `setup` throw when touched, which would answer 500.
      const { server } = setup();
      const start = { hubId: "acme", workflowId: "review", input: {} };
      const answers = [
        await call(server, "GET", "/api/waiting-runs", bearer("alice-token")),
        await call(server, "GET", "/api/runs/run_alice", bearer("alice-token")),
        await call(server, "POST", "/api/runs", bearer("alice-token"), start),
        await call(server, "POST", "/api/login", {}, { password: "anything" }),
      ];
      expect(answers.map((answer) => answer.status)).toEqual([200, 200, 200, 404]);
    });
  });
});
