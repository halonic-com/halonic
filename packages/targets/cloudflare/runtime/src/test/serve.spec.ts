/**
 * The API behind the real Worker inside workerd: real Durable Objects keep the
 * login limit, the sessions and the daily count. Run by `serve-workerd.test.ts`.
 */

import { env } from "cloudflare:workers";
import { createPbkdf2ChainHasher } from "@halonicjs/adapter-password-pbkdf2";
import { describe, expect, it } from "vitest";
import type { RuntimeEnv } from "../env.ts";
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
});
