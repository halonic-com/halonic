import type { Coordination, RunExecutor, RunStore } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import type { Server, TrustDecision, TrustGate } from "./api.ts";
import { FakeCoordination, FakePasswordHasher, TestClock, testServer } from "./test-server.ts";

const trusted: TrustDecision = { state: "trusted", message: "Trusted." };
const host = "halonic.acme.example";
/** A server with no password answers only loopback names, so its tests send `localhost`. */
const hostOf = new WeakMap<Server, string>();
const known = { id: "run_1", status: "waiting" };

interface Calls {
  sent: unknown[][];
  cancelled: string[];
  logged: unknown[];
  lookups: string[];
}

function setup(
  options: {
    state?: TrustDecision;
    sendFails?: Error;
    cancel?: boolean;
    passwordHash?: string | null;
  } = {},
) {
  const calls: Calls = { sent: [], cancelled: [], logged: [], lookups: [] };
  const runs = {
    send: async (...args: unknown[]) => {
      calls.sent.push(args);
      if (options.sendFails !== undefined) throw options.sendFails;
      return known;
    },
    ...(options.cancel === false
      ? {}
      : {
          cancel: async (runId: string) => {
            calls.cancelled.push(runId);
            return { ...known, status: "failed" };
          },
        }),
  } as unknown as RunExecutor;
  const runStore = {
    list: async () => [],
    get: async (runId: string) => {
      calls.lookups.push(runId);
      return runId === "run_1" ? known : null;
    },
  } as unknown as Pick<RunStore, "list" | "get">;
  const trust: TrustGate = { check: async () => options.state ?? trusted };
  const clock = new TestClock();
  const server: Server = testServer({
    passwordHash: options.passwordHash ?? null,
    clock,
    runs,
    runStore,
    trust,
    errorLog: { record: (error) => calls.logged.push(error) },
    passwordHasher: new FakePasswordHasher(),
    coordination: new FakeCoordination(clock) as unknown as Coordination,
    config: { allowedHosts: [host], maxBodyBytes: 4096 },
  });
  hostOf.set(
    server,
    options.passwordHash === undefined || options.passwordHash === null ? "localhost" : host,
  );
  return { server, calls };
}

function call(
  server: Server,
  method: string,
  path: string,
  options: { body?: unknown; type?: string; cookie?: string; rawBody?: string } = {},
): Promise<Response> {
  const host = hostOf.get(server) ?? "localhost";
  const headers: Record<string, string> = { host };
  if (options.type !== "") headers["content-type"] = options.type ?? "application/json";
  if (options.cookie !== undefined) headers["cookie"] = options.cookie;
  const init: RequestInit =
    method === "GET"
      ? { method, headers }
      : { method, headers, body: options.rawBody ?? JSON.stringify(options.body ?? {}) };
  return server.handle(new Request(`https://${host}${path}`, init));
}

async function signIn(server: Server): Promise<string> {
  const response = await call(server, "POST", "/api/login", {
    body: { password: "correct horse" },
  });
  return (response.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
}

describe("run routes", () => {
  verifies("server.run-routes", () => {
    it("answers the summary of a known run", async () => {
      const { server } = setup();
      const response = await call(server, "GET", "/api/runs/run_1");
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual(known);
    });

    it("answers 404 run_not_found for an unknown run on all three routes, naming nothing", async () => {
      const { server, calls } = setup();
      for (const [method, path] of [
        ["GET", "/api/runs/other"],
        ["POST", "/api/runs/other/events"],
        ["POST", "/api/runs/other/cancel"],
      ] as const) {
        const response = await call(server, method, path, { body: { event: "approve" } });
        expect(response.status).toBe(404);
        const body = await response.json();
        expect(body).toEqual({ code: "run_not_found", message: expect.any(String) });
        expect(JSON.stringify(body)).not.toContain("other");
      }
      expect(calls.sent).toEqual([]);
      expect(calls.cancelled).toEqual([]);
    });

    it("answers 404 for ids and actions it doesn't have", async () => {
      const { server } = setup();
      for (const [method, path] of [
        ["GET", "/api/runs/run_1/events"],
        ["POST", "/api/runs/run_1/other"],
        ["POST", "/api/runs/run_1"],
        ["GET", "/api/runs/run_1/cancel"],
        ["POST", "/api/runs/run_1/cancel/extra"],
        ["GET", "/api/runs/%E0%A4%A"],
        ["GET", `/api/runs/${"x".repeat(257)}`],
        ["GET", "/api/runs/a%2Fb"],
      ] as const) {
        expect((await call(server, method, path)).status).toBe(404);
      }
    });

    it("delivers an event with its payload and call id, and answers the summary", async () => {
      const { server, calls } = setup();
      const response = await call(server, "POST", "/api/runs/run_1/events", {
        body: { event: "approve", payload: { note: "ok" }, callId: "c1" },
      });
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual(known);
      expect(calls.sent).toEqual([["run_1", "approve", { note: "ok" }, { callId: "c1" }]]);
    });

    it("delivers an event that names no call without options", async () => {
      const { server, calls } = setup();
      await call(server, "POST", "/api/runs/run_1/events", { body: { event: "approve" } });
      expect(calls.sent).toEqual([["run_1", "approve", undefined, undefined]]);
    });

    it("refuses a malformed event with 400 before the store or the executor is asked", async () => {
      const { server, calls } = setup();
      for (const body of [
        {},
        { event: "" },
        { event: 3 },
        { event: "x".repeat(257) },
        { event: "approve", callId: "" },
        { event: "approve", callId: 4 },
      ]) {
        expect((await call(server, "POST", "/api/runs/run_1/events", { body })).status).toBe(400);
      }
      expect(
        (await call(server, "POST", "/api/runs/run_1/events", { rawBody: "[1]" })).status,
      ).toBe(400);
      expect(
        (await call(server, "POST", "/api/runs/run_1/events", { rawBody: "not json" })).status,
      ).toBe(400);
      expect(calls.sent).toEqual([]);
      expect(calls.lookups).toEqual([]);
    });

    it("answers 409 event_not_accepted when the executor refuses, and keeps the cause in the log", async () => {
      const { server, calls } = setup({
        sendFails: new Error("run waits on c1, not /secret/path"),
      });
      const response = await call(server, "POST", "/api/runs/run_1/events", {
        body: { event: "approve", callId: "c2" },
      });
      expect(response.status).toBe(409);
      const text = await response.text();
      expect(JSON.parse(text)).toEqual({ code: "event_not_accepted", message: expect.any(String) });
      expect(text).not.toContain("secret");
      expect(calls.logged).toHaveLength(1);
    });

    it.each(["new", "changed", "unreadable", "refused"] as const)(
      "refuses an event in a %s workspace with 403, but still cancels",
      async (state) => {
        const { server, calls } = setup({ state: { state, message: "No." } });
        const refused = await call(server, "POST", "/api/runs/run_1/events", {
          body: { event: "approve" },
        });
        expect(refused.status).toBe(403);
        expect(await refused.json()).toEqual({
          code: "workspace_not_trusted",
          message: expect.any(String),
        });
        expect(calls.sent).toEqual([]);

        const cancelled = await call(server, "POST", "/api/runs/run_1/cancel");
        expect(cancelled.status).toBe(200);
        expect(calls.cancelled).toEqual(["run_1"]);
      },
    );

    it("cancels a run and answers the summary after the cancel", async () => {
      const { server, calls } = setup();
      const response = await call(server, "POST", "/api/runs/run_1/cancel");
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ ...known, status: "failed" });
      expect(calls.cancelled).toEqual(["run_1"]);
    });

    it("answers 501 cancel_not_supported for an executor without cancel", async () => {
      const { server } = setup({ cancel: false });
      const response = await call(server, "POST", "/api/runs/run_1/cancel");
      expect(response.status).toBe(501);
      expect(((await response.json()) as { code: string }).code).toBe("cancel_not_supported");
    });

    it("needs a sign-in when a password is set, and asks nothing before it", async () => {
      const { server, calls } = setup({ passwordHash: "hash:correct horse" });
      for (const [method, path] of [
        ["GET", "/api/runs/run_1"],
        ["POST", "/api/runs/run_1/events"],
        ["POST", "/api/runs/run_1/cancel"],
      ] as const) {
        const response = await call(server, method, path, { body: { event: "approve" } });
        expect(response.status).toBe(401);
      }
      expect(calls.lookups).toEqual([]);
      expect(calls.sent).toEqual([]);

      const cookie = await signIn(server);
      expect((await call(server, "GET", "/api/runs/run_1", { cookie })).status).toBe(200);
    });

    it("refuses a cross-site form POST that has the session cookie but no Origin", async () => {
      const { server, calls } = setup({ passwordHash: "hash:correct horse" });
      const cookie = await signIn(server);
      for (const type of [
        "application/x-www-form-urlencoded",
        "multipart/form-data; boundary=x",
        "text/plain",
        "",
      ]) {
        for (const path of ["/api/runs/run_1/events", "/api/runs/run_1/cancel"]) {
          const response = await call(server, "POST", path, {
            type,
            cookie,
            rawBody: "event=approve",
          });
          expect(response.status).toBe(415);
          expect(((await response.json()) as { code: string }).code).toBe("unsupported_media_type");
        }
      }
      expect(calls.sent).toEqual([]);
      expect(calls.cancelled).toEqual([]);
    });

    it("refuses a POST from another origin and a foreign Host", async () => {
      const { server, calls } = setup();
      const foreignOrigin = await server.handle(
        new Request("https://localhost/api/runs/run_1/cancel", {
          method: "POST",
          headers: {
            host: "localhost",
            origin: "https://evil.example",
            "content-type": "application/json",
          },
          body: "{}",
        }),
      );
      expect(foreignOrigin.status).toBe(403);
      const foreignHost = await server.handle(
        new Request("https://evil.example/api/runs/run_1/cancel", {
          method: "POST",
          headers: { host: "evil.example", "content-type": "application/json" },
          body: "{}",
        }),
      );
      expect(foreignHost.status).toBe(421);
      expect(calls.cancelled).toEqual([]);
    });

    it("refuses a body over the limit", async () => {
      const { server, calls } = setup();
      const response = await call(server, "POST", "/api/runs/run_1/events", {
        body: { event: "approve", payload: "x".repeat(5000) },
      });
      expect(response.status).toBe(413);
      expect(calls.sent).toEqual([]);
    });

    it("has no route that grants trust", async () => {
      const { server } = setup();
      for (const path of ["/api/runs/run_1/trust", "/api/runs/trust", "/api/runs/run_1/grant"]) {
        expect((await call(server, "POST", path)).status).toBe(404);
      }
    });
  });
});
