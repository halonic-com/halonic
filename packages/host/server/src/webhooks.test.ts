import type { Coordination, RunExecutor } from "@halonicjs/ports";
import type { PlacedRoutine } from "@halonicjs/routines";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import type { Server, TrustDecision, WebhookRoutines } from "./api.ts";
import { FakeCoordination, FakePasswordHasher, TestClock, testServer } from "./test-server.ts";

const host = "halonic.acme.example";
const secret = "whsec-test-value";
const trusted: TrustDecision = { state: "trusted", message: "Trusted." };

function routine(overrides: Record<string, unknown> = {}): PlacedRoutine {
  return {
    hub: "acme",
    routine: {
      version: 1,
      id: "orders",
      name: "Orders",
      enabled: true,
      trigger: { webhook: { secret: "acme-hook", headers: ["x-event"] } },
      run: {
        workflow: "handle-order",
        input: { order: "{{trigger.body.id}}", event: "{{trigger.headers.x-event}}" },
      },
      overlap: "skip",
      catchUp: "last",
      ...overrides,
    },
  } as unknown as PlacedRoutine;
}

async function hmac(key: string, text: string): Promise<string> {
  const imported = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", imported, new TextEncoder().encode(text));
  return Array.from(new Uint8Array(signature), (b) => b.toString(16).padStart(2, "0")).join("");
}

function setup(
  options: {
    placed?: PlacedRoutine | null;
    secrets?: Record<string, string>;
    trust?: TrustDecision | Error;
    startFails?: boolean;
    passwordHash?: string | null;
  } = {},
) {
  const clock = new TestClock();
  const started: unknown[] = [];
  let failNext = options.startFails ?? false;
  const run = async (request: unknown) => {
    if (failNext) {
      failNext = false;
      throw new Error("executor down");
    }
    started.push(request);
    return { id: "run_1" };
  };
  const runs = { start: run, startAgent: run } as unknown as RunExecutor;
  const placed = options.placed === undefined ? routine() : options.placed;
  const found: string[] = [];
  const webhooks: WebhookRoutines = {
    find: async (key) => {
      found.push(key);
      return placed !== null && key === "acme/orders" ? placed : null;
    },
  };
  // A password makes the server answer on its own host name, as a real deployment does.
  const passwordHash = options.passwordHash ?? "hash:pw";
  const values: Record<string, string> = { "acme-hook": secret, ...options.secrets };
  const coordination = new FakeCoordination(clock);
  const decision = options.trust ?? trusted;
  const server: Server = testServer({
    passwordHash,
    clock,
    runs,
    webhooks,
    secrets: {
      get: async (name) => (name === "serve-password" ? passwordHash : (values[name] ?? null)),
    },
    trust: {
      check: async () => {
        if (decision instanceof Error) throw decision;
        return decision;
      },
    },
    coordination: coordination as unknown as Coordination,
    passwordHasher: new FakePasswordHasher(),
  });

  async function send(
    parts: {
      path?: string;
      body?: string;
      key?: string;
      delivery?: string;
      timestamp?: number;
      headers?: Record<string, string>;
      method?: string;
      host?: string;
      sign?: boolean;
    } = {},
  ): Promise<Response> {
    const body = parts.body ?? '{"id":"o-7"}';
    const delivery = parts.delivery ?? "d-1";
    const timestamp = String(parts.timestamp ?? Math.floor(clock.now().getTime() / 1000));
    const headers: Record<string, string> = {
      host: parts.host ?? host,
      "content-type": "application/json",
      "x-halonic-delivery": delivery,
      "x-halonic-timestamp": timestamp,
      ...parts.headers,
    };
    if (parts.sign !== false) {
      headers["x-halonic-signature"] =
        `sha256=${await hmac(parts.key ?? secret, `${delivery}.${timestamp}.${body}`)}`;
    }
    return server.handle(
      new Request(`https://${parts.host ?? host}${parts.path ?? "/api/webhooks/acme/orders"}`, {
        method: parts.method ?? "POST",
        headers,
        ...(parts.method === "GET" ? {} : { body }),
      }),
    );
  }
  return { send, started, clock, coordination, found };
}

verifies("server.webhooks", () => {
  describe("a signed request", () => {
    it("starts the routine with the body and the listed headers", async () => {
      const { send, started } = setup();
      const response = await send({ headers: { "x-event": "paid", authorization: "Bearer x" } });
      expect(response.status).toBe(202);
      expect(await response.json()).toEqual({ runId: "run_1" });
      expect(started).toEqual([
        {
          hubId: "acme",
          workflowId: "handle-order",
          input: { order: "o-7", event: "paid" },
          trigger: {
            type: "webhook",
            routineId: "acme/orders",
            at: "2026-11-12T10:00:00.000Z",
            deliveryId: "d-1",
          },
          runId: expect.stringMatching(/^webhook-[0-9a-f]{64}$/),
        },
      ]);
    });

    it("starts an agent with the body in its prompt", async () => {
      const agent = routine({
        run: { agent: "triage", prompt: "Order {{trigger.body.id}} arrived" },
      });
      const { send, started } = setup({ placed: agent });
      expect((await send()).status).toBe(202);
      expect(started).toMatchObject([
        { hubId: "acme", agentId: "triage", prompt: "Order o-7 arrived" },
      ]);
    });

    it("gives the same delivery the same run id", async () => {
      const first = setup();
      const second = setup();
      await first.send();
      await second.send();
      expect(first.started).toEqual(second.started);
    });

    it("needs no session on a server that has a password", async () => {
      const { send, started } = setup();
      expect((await send()).status).toBe(202);
      expect(started).toHaveLength(1);
    });
  });

  describe("a request that can't prove it was signed", () => {
    async function rejections() {
      const s = setup();
      const signature = { "x-halonic-signature": `sha256=${"0".repeat(64)}` };
      const refused = [
        await s.send({ key: "wrong-secret" }),
        await s.send({ sign: false }),
        await s.send({ headers: signature, sign: false }),
        await s.send({ headers: { "x-halonic-signature": "sha256=zz" }, sign: false }),
        await s.send({ delivery: "bad id!" }),
        await s.send({ headers: { "x-halonic-timestamp": "12e3" }, sign: false }),
        await s.send({ path: "/api/webhooks/acme" }),
        await s.send({ path: "/api/webhooks/acme/orders/extra" }),
        await s.send({ path: "/api/webhooks/acme/other" }),
      ];
      return { refused, started: s.started };
    }

    it("answers every refusal with the same 401 and starts nothing", async () => {
      const { refused, started } = await rejections();
      for (const response of refused) {
        expect(response.status).toBe(401);
        expect(await response.json()).toEqual({
          code: "webhook_rejected",
          message: "The request isn't a valid, signed webhook for this address.",
        });
      }
      expect(started).toEqual([]);
    });

    it("answers the same for a routine that is off, has another trigger, or has no secret set", async () => {
      const off = setup({ placed: routine({ enabled: false }) });
      const clock = setup({ placed: routine({ trigger: { every: "1h" } }) });
      const unset = setup({ secrets: { "acme-hook": "" } });
      const noSecret = setup();
      const bodies = await Promise.all(
        [off, clock, unset].map(async (s) => {
          const response = await s.send();
          expect(s.started).toEqual([]);
          return [response.status, await response.json()];
        }),
      );
      const wrong = await noSecret.send({ key: "nope" });
      const wrongBody = await wrong.json();
      for (const body of bodies) {
        expect(body).toEqual([401, wrongBody]);
      }
    });

    it("never uses a secret that belongs to Halonic as the key", async () => {
      const hash = "hash:pw";
      const sneaky = routine({ trigger: { webhook: { secret: "serve-password", headers: [] } } });
      const { send, started } = setup({ placed: sneaky, passwordHash: hash });
      const response = await send({ key: hash });
      expect(response.status).toBe(401);
      expect(started).toEqual([]);
    });

    it("does not say anything about the workspace's trust", async () => {
      const { send, started } = setup({ trust: { state: "new", message: "never trusted" } });
      expect((await send({ key: "wrong-secret" })).status).toBe(401);
      expect(started).toEqual([]);
    });
  });

  describe("the time window", () => {
    it("takes a timestamp up to 300 seconds off, either way, and refuses more", async () => {
      const { send, clock, started } = setup();
      const now = Math.floor(clock.now().getTime() / 1000);
      expect((await send({ timestamp: now - 300, delivery: "a" })).status).toBe(202);
      expect((await send({ timestamp: now + 300, delivery: "b" })).status).toBe(202);
      expect((await send({ timestamp: now - 301, delivery: "c" })).status).toBe(401);
      expect((await send({ timestamp: now + 301, delivery: "d" })).status).toBe(401);
      expect(started).toHaveLength(2);
    });
  });

  describe("a repeated delivery", () => {
    it("starts once and answers 409 the second time", async () => {
      const { send, started } = setup();
      expect((await send()).status).toBe(202);
      const again = await send();
      expect(again.status).toBe(409);
      expect(await again.json()).toMatchObject({ code: "webhook_replayed" });
      expect(started).toHaveLength(1);
    });

    it("breaks the signature when the id or the time of a captured request changes", async () => {
      const { send, started, clock } = setup();
      const now = Math.floor(clock.now().getTime() / 1000);
      const captured = await hmac(secret, `d-1.${now}.{"id":"o-7"}`);
      const newId = await send({
        delivery: "d-2",
        sign: false,
        headers: { "x-halonic-signature": `sha256=${captured}` },
      });
      const newTime = await send({
        timestamp: now + 1,
        sign: false,
        headers: { "x-halonic-signature": `sha256=${captured}` },
      });
      expect([newId.status, newTime.status]).toEqual([401, 401]);
      expect(started).toEqual([]);
    });

    it("treats a different delivery id as a different delivery", async () => {
      const { send, started } = setup();
      expect((await send({ delivery: "same" })).status).toBe(202);
      expect((await send({ delivery: "other" })).status).toBe(202);
      expect(started).toHaveLength(2);
    });

    it("still refuses a replay at exactly timestamp + 300 seconds, for a request sent 300 seconds early", async () => {
      const { send, started, clock } = setup();
      const early = Math.floor(clock.now().getTime() / 1000) + 300;
      expect((await send({ timestamp: early, delivery: "edge" })).status).toBe(202);
      clock.advance(600_000);
      expect(Math.floor(clock.now().getTime() / 1000)).toBe(early + 300);
      expect((await send({ timestamp: early, delivery: "edge" })).status).toBe(409);
      expect(started).toHaveLength(1);
    });

    it("is free again after 660 seconds, two windows and a 60 second margin", async () => {
      const { send, started, clock } = setup();
      expect((await send()).status).toBe(202);
      clock.advance(661_000);
      expect((await send({ timestamp: Math.floor(clock.now().getTime() / 1000) })).status).toBe(
        202,
      );
      expect(started).toHaveLength(2);
    });
  });

  describe("the trust gate", () => {
    it("refuses a signed request in a workspace that isn't trusted, without using the delivery id", async () => {
      const untrusted = setup({ trust: { state: "changed", message: "It changed." } });
      const response = await untrusted.send();
      expect(response.status).toBe(403);
      expect(await response.json()).toMatchObject({ code: "workspace_not_trusted" });
      expect(untrusted.started).toEqual([]);
      expect(untrusted.coordination.leases.size).toBe(0);
    });

    it("fails the request when the gate throws, and starts nothing", async () => {
      const { send, started } = setup({ trust: new Error("gate down") });
      expect((await send()).status).toBe(500);
      expect(started).toEqual([]);
    });
  });

  describe("a start that fails", () => {
    it("answers 500 and lets the sender's retry through", async () => {
      const { send, started } = setup({ startFails: true });
      expect((await send()).status).toBe(500);
      expect((await send()).status).toBe(202);
      expect(started).toHaveLength(1);
    });

    it("answers 500 for a routine that runs outside a hub and starts nothing", async () => {
      const workspaceLevel = { ...routine(), hub: null } as PlacedRoutine;
      const { send, started } = setup({ placed: workspaceLevel });
      expect((await send({ path: "/api/webhooks/acme/orders" })).status).toBe(500);
      expect(started).toEqual([]);
    });
  });

  describe("the rest of the security layer", () => {
    it("refuses a foreign Host before anything is checked", async () => {
      const { send, found } = setup();
      const response = await send({ host: "evil.example" });
      expect(response.status).toBe(421);
      expect(found).toEqual([]);
    });

    it("refuses a body over the limit", async () => {
      const { send, started } = setup();
      expect((await send({ body: "x".repeat(2000) })).status).toBe(413);
      expect(started).toEqual([]);
    });

    it("answers 404 to a GET at a webhook address", async () => {
      const { send } = setup();
      expect((await send({ method: "GET" })).status).toBe(404);
    });
  });
});
