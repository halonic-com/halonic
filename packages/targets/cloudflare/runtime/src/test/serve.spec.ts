/**
 * The API behind the real Worker inside workerd: real Durable Objects keep the
 * login limit, the sessions and the daily count. Run by `serve-workerd.test.ts`.
 */

import { env } from "cloudflare:workers";
import { writeDefinitionSnapshot } from "@halonicjs/adapter-cloudflare-storage";
import { createPbkdf2ChainHasher } from "@halonicjs/adapter-password-pbkdf2";
import type { RunExecutor } from "@halonicjs/ports";
import { describe, expect, it } from "vitest";
import type { RuntimeEnv } from "../env.ts";
import { scopedKeyPrefix } from "../runtime.ts";
import { serveRequest } from "../serve.ts";

export { CoordinationObject, RoutinesObject, RunObject } from "../index.ts";

const host = "halonic.example.com";
const password = "a password made up for this test";

let configured: RuntimeEnv | undefined;

/** The deployment these cases run against, made on first use: the password hash costs six PBKDF2 runs. */
async function deployment(): Promise<RuntimeEnv> {
  configured ??= {
    ...(env as unknown as RuntimeEnv),
    HALONIC_SECRET_TOKEN_KEY: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    HALONIC_SECRET_SERVE_PASSWORD: await createPbkdf2ChainHasher().hash(password),
    HALONIC_ALLOWED_HOSTS: host,
    HALONIC_DEPLOYMENT_ID: "serve-spec",
  } as unknown as RuntimeEnv;
  return configured;
}

// Each case gets storage of its own, so the counts of one never reach another.
let scope = 0;
function nextScope(): string {
  scope += 1;
  return `serve-spec-${scope}`;
}

async function ask(
  path: string,
  options: { method?: string; body?: unknown; host?: string; scope?: string; env?: object } = {},
): Promise<Response> {
  const requestHost = options.host ?? host;
  return serveRequest(
    new Request(`https://${requestHost}${path}`, {
      method: options.method ?? "GET",
      headers: {
        host: requestHost,
        "content-type": "application/json",
        "cf-connecting-ip": "203.0.113.7",
      },
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    }),
    { ...(await deployment()), ...options.env } as RuntimeEnv,
    { scope: options.scope ?? nextScope() },
  );
}

describe("the API in workerd", () => {
  it("answers hello on the listed host and refuses the preview address", async () => {
    expect((await ask("/api/hello")).status).toBe(200);
    expect((await ask("/api/hello", { host: "version-1.halonic.workers.dev" })).status).toBe(421);
  });

  it("signs in with the right password and refuses a wrong one", async () => {
    const scope = nextScope();
    const wrong = await ask("/api/login", { method: "POST", body: { password: "nope" }, scope });
    expect(wrong.status).toBe(401);
    const right = await ask("/api/login", { method: "POST", body: { password }, scope });
    expect(right.status).toBe(200);
    expect(right.headers.get("set-cookie")).toContain("HttpOnly");
  });

  it("gives no API route without a session", async () => {
    expect((await ask("/api/trust")).status).toBe(401);
  });

  it("answers 429 past the daily ceiling, from the counter in the Durable Object", async () => {
    const scope = nextScope();
    const withCeiling = { HALONIC_DAILY_REQUESTS: "2" };
    const statuses: number[] = [];
    for (let call = 0; call < 3; call += 1) {
      statuses.push((await ask("/api/hello", { scope, env: withCeiling })).status);
    }
    expect(statuses).toEqual([200, 200, 429]);
  });

  it("refuses a run start with 501 once signed in", async () => {
    const scope = nextScope();
    const login = await ask("/api/login", { method: "POST", body: { password }, scope });
    const cookie = (login.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
    const response = await serveRequest(
      new Request(`https://${host}/api/runs`, {
        method: "POST",
        headers: {
          host,
          cookie,
          "content-type": "application/json",
          "cf-connecting-ip": "203.0.113.7",
        },
        body: JSON.stringify({ hubId: "h", workflowId: "w", input: {} }),
      }),
      await deployment(),
      { scope },
    );
    expect(response.status).toBe(501);
  });

  describe("webhooks from the routines in the snapshot", () => {
    const hookSecret = "a webhook secret made up for this test";
    const routineFile = [
      "id: orders",
      "name: Orders",
      "trigger: { webhook: { secret: acme-hook } }",
      "run: { workflow: handle-order, input: { order: '{{trigger.body.id}}' } }",
    ].join("\n");

    /** A scope whose snapshot holds one webhook routine, and a executor that records what it is asked to start. */
    async function withRoutine(files: Record<string, string> = {}) {
      const scope = nextScope();
      const bucket = (await deployment()).DEFINITIONS as unknown as Parameters<
        typeof writeDefinitionSnapshot
      >[0];
      await writeDefinitionSnapshot(
        bucket,
        { "hubs/acme/workflows/routines/orders.routine.yaml": routineFile, ...files },
        scopedKeyPrefix(scope),
      );
      const started: unknown[] = [];
      const start = async (request: unknown) => {
        started.push(request);
        return { id: "run_1" };
      };
      const runs = { start, startAgent: start } as unknown as RunExecutor;
      return { scope, started, runs };
    }

    async function sign(delivery: string, timestamp: string, body: string): Promise<string> {
      const key = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(hookSecret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"],
      );
      const signature = await crypto.subtle.sign(
        "HMAC",
        key,
        new TextEncoder().encode(`${delivery}.${timestamp}.${body}`),
      );
      return Array.from(new Uint8Array(signature), (byte) =>
        byte.toString(16).padStart(2, "0"),
      ).join("");
    }

    async function deliver(
      setup: { scope: string; runs: RunExecutor },
      options: { address?: string; delivery?: string; signedWith?: string } = {},
    ): Promise<Response> {
      const body = '{"id":"o-7"}';
      const delivery = options.delivery ?? "d-1";
      const timestamp = String(Math.floor(Date.now() / 1000));
      const signature = options.signedWith ?? (await sign(delivery, timestamp, body));
      return serveRequest(
        new Request(`https://${host}/api/webhooks/${options.address ?? "acme/orders"}`, {
          method: "POST",
          headers: {
            host,
            "content-type": "application/json",
            "x-halonic-delivery": delivery,
            "x-halonic-timestamp": timestamp,
            "x-halonic-signature": `sha256=${signature}`,
          },
          body,
        }),
        {
          ...(await deployment()),
          HALONIC_SECRET_ACME_HOOK: hookSecret,
        } as unknown as RuntimeEnv,
        { scope: setup.scope, runs: setup.runs },
      );
    }

    it("starts the routine's run for a signed delivery", async () => {
      const setup = await withRoutine();
      const response = await deliver(setup);
      expect(response.status).toBe(202);
      expect(await response.json()).toEqual({ runId: "run_1" });
      expect(setup.started).toMatchObject([
        { hubId: "acme", workflowId: "handle-order", input: { order: "o-7" } },
      ]);
    });

    it("refuses a bad signature and starts nothing", async () => {
      const setup = await withRoutine();
      const response = await deliver(setup, { signedWith: "0".repeat(64) });
      expect(response.status).toBe(401);
      expect(setup.started).toEqual([]);
    });

    it("refuses a delivery it has already accepted", async () => {
      const setup = await withRoutine();
      expect((await deliver(setup)).status).toBe(202);
      const again = await deliver(setup);
      expect(again.status).toBe(409);
      expect(setup.started).toHaveLength(1);
    });

    it("answers an address with no routine as it answers a bad signature", async () => {
      const setup = await withRoutine();
      const known = await deliver(setup, { signedWith: "0".repeat(64) });
      const unknown = await deliver(setup, { address: "acme/nothing" });
      expect(unknown.status).toBe(known.status);
      expect(await unknown.text()).toBe(await known.clone().text());
      expect(setup.started).toEqual([]);
    });

    it("answers a routine that is switched off as an unknown address", async () => {
      const setup = await withRoutine({
        "hubs/acme/workflows/routines/orders.routine.yaml": `${routineFile}\nenabled: false`,
      });
      const response = await deliver(setup);
      expect(response.status).toBe(401);
      expect(setup.started).toEqual([]);
    });
  });
});
