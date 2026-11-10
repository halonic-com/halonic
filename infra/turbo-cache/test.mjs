import assert from "node:assert/strict";
import { test } from "node:test";

// timingSafeEqual exists only in the Workers runtime; shim it for Node.
crypto.subtle.timingSafeEqual ??= (a, b) => Buffer.from(a).equals(Buffer.from(b));
const { default: worker } = await import("./worker.mjs");

const kv = (m) => ({ get: async (k) => m[k] ?? null });
const call = (env) =>
  worker.fetch(
    new Request("https://x/v8/artifacts/status", { headers: { authorization: "Bearer t" } }),
    {
      TURBO_TOKEN: { get: async () => "t" },
      ...env,
    },
  );

test("turbo-cache serves while the switch is on", async () => {
  const res = await call({ SPEND_KV: kv({ spend_ok: "on", "spend_ok:turbo-cache": "on" }) });
  assert.equal(res.status, 200);
});

test("turbo-cache refuses with 503 when the switch is off or unreadable", async () => {
  assert.equal(
    (await call({ SPEND_KV: kv({ spend_ok: "off", "spend_ok:turbo-cache": "on" }) })).status,
    503,
  );
  assert.equal(
    (await call({ SPEND_KV: kv({ spend_ok: "on", "spend_ok:turbo-cache": "off" }) })).status,
    503,
  );
  assert.equal((await call({})).status, 503);
});

test("turbo-cache: no token 401, read token cannot upload, write token can", async () => {
  const store = new Map();
  const env = {
    SPEND_KV: kv({ spend_ok: "on", "spend_ok:turbo-cache": "on" }),
    TURBO_TOKEN: { get: async () => "w" },
    TURBO_TOKEN_READ: { get: async () => "r" },
    R2_STORE: {
      put: async (k, b) => store.set(k, b),
      get: async (k) => (store.has(k) ? { size: 1, body: "x" } : null),
      head: async (k) => (store.has(k) ? { size: 1, uploaded: new Date() } : null),
    },
  };
  const req = (method, token, path = "/v8/artifacts/abcdef123456") =>
    worker.fetch(
      new Request(`https://x${path}`, {
        method,
        body: method === "PUT" ? "data" : undefined,
        headers: token ? { authorization: `Bearer ${token}` } : {},
      }),
      env,
    );
  assert.equal((await req("GET", undefined)).status, 401);
  assert.equal((await req("PUT", "r")).status, 403);
  assert.equal((await req("PUT", "w")).status, 202);
  assert.equal((await req("GET", "r")).status, 200);
  assert.equal((await req("HEAD", "r")).status, 200);
});
