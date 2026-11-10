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
