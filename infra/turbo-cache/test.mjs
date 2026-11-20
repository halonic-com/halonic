import assert from "node:assert/strict";
import { test } from "node:test";

// timingSafeEqual exists only in the Workers runtime; shim it for Node.
crypto.subtle.timingSafeEqual ??= (a, b) => Buffer.from(a).equals(Buffer.from(b));
const { default: worker } = await import("./worker.mjs");

import { createHmac } from "node:crypto";

const signedToken = (kind, key) => {
  const head = `${kind}.${Math.floor(Date.now() / 1000) + 600}`;
  return `${head}.${createHmac("sha256", key).update(head).digest("base64url")}`;
};
const writeToken = (key) => signedToken("w", key);
const kv = (m) => ({ get: async (k) => m[k] ?? null });
const call = (env) =>
  worker.fetch(
    new Request("https://x/v8/artifacts/status", { headers: { authorization: "Bearer t" } }),
    {
      TURBO_TOKEN_READ: { get: async () => "t" },
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
    TURBO_SIGNING_KEY: { get: async () => "k" },
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
  assert.equal((await req("PUT", writeToken("k"))).status, 202);
  assert.equal((await req("PUT", writeToken("other"))).status, 401);
  assert.equal((await req("GET", "r")).status, 200);
  assert.equal((await req("HEAD", "r")).status, 200);
});

test("turbo-cache rejects unauthenticated requests with 401 before any KV read", async () => {
  let reads = 0;
  const SPEND_KV = {
    get: async () => {
      reads++;
      return "on";
    },
  };
  const env = { TURBO_TOKEN: { get: async () => "t" }, SPEND_KV };
  const bad = [{}, { authorization: "Bearer nope" }];
  for (const headers of bad) {
    const res = await worker.fetch(new Request("https://x/v8/artifacts/status", { headers }), env);
    assert.equal(res.status, 401);
  }
  assert.equal(reads, 0);
});

// A GitHub-like OIDC token signed with a throwaway key, served through a stubbed JWKS fetch.
const pair = await crypto.subtle.generateKey(
  {
    name: "RSASSA-PKCS1-v1_5",
    modulusLength: 2048,
    publicExponent: new Uint8Array([1, 0, 1]),
    hash: "SHA-256",
  },
  true,
  ["sign", "verify"],
);
const enc = (o) => Buffer.from(typeof o === "string" ? o : JSON.stringify(o)).toString("base64url");
async function oidc(claims) {
  const head = enc({ alg: "RS256", kid: "k1" });
  const body = enc({
    iss: "https://token.actions.githubusercontent.com",
    aud: "halonic-turbo-cache",
    exp: Math.floor(Date.now() / 1000) + 300,
    repository: "halonic-com/halonic",
    ...claims,
  });
  const sig = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    pair.privateKey,
    Buffer.from(`${head}.${body}`),
  );
  return `${head}.${body}.${Buffer.from(sig).toString("base64url")}`;
}
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) =>
  String(url).endsWith("/.well-known/jwks")
    ? Response.json({
        keys: [{ ...(await crypto.subtle.exportKey("jwk", pair.publicKey)), kid: "k1" }],
      })
    : realFetch(url, init);

test("turbo-cache: the merge queue writes only to q/, reads q/ then main's entry; main never sees q/", async () => {
  const store = new Map();
  const env = {
    SPEND_KV: kv({ spend_ok: "on", "spend_ok:turbo-cache": "on" }),
    TURBO_SIGNING_KEY: { get: async () => "k" },
    TURBO_TOKEN_READ: { get: async () => "r" },
    R2_STORE: {
      put: async (k, b) => store.set(k, await new Response(b).text()),
      get: async (k) => (store.has(k) ? { size: 1, body: store.get(k) } : null),
      head: async (k) => (store.has(k) ? { size: 1, uploaded: new Date() } : null),
    },
  };
  const send = (method, token, hash, body) =>
    worker.fetch(
      new Request(`https://x/v8/artifacts/${hash}`, {
        method,
        body,
        headers: { authorization: `Bearer ${token}` },
      }),
      env,
    );
  const lookup = async (token, hashes) =>
    (
      await worker.fetch(
        new Request("https://x/v8/artifacts", {
          method: "POST",
          body: JSON.stringify({ hashes }),
          headers: { authorization: `Bearer ${token}` },
        }),
        env,
      )
    ).json();
  const main = writeToken("k");
  const queue = signedToken("q", "k");

  // Main's entry; the queue's upload for the same hash lands in q/ and leaves main's entry alone.
  assert.equal((await send("PUT", main, "hash000001", "main")).status, 202);
  assert.equal((await send("PUT", queue, "hash000001", "queue")).status, 202);
  assert.equal(store.get("hash000001"), "main");
  assert.equal(store.get("q/hash000001"), "queue");
  // The queue reads its own area first; main and the read token never see it.
  assert.equal(await (await send("GET", queue, "hash000001")).text(), "queue");
  assert.equal(await (await send("GET", main, "hash000001")).text(), "main");
  assert.equal(await (await send("GET", "r", "hash000001")).text(), "main");

  // A queue-only entry: the queue finds it, main and the read token get a miss.
  assert.equal((await send("PUT", queue, "hash000002", "queue")).status, 202);
  assert.equal(store.has("hash000002"), false);
  assert.equal((await send("GET", queue, "hash000002")).status, 200);
  assert.equal((await send("HEAD", queue, "hash000002")).status, 200);
  assert.equal((await send("GET", main, "hash000002")).status, 404);
  assert.equal((await send("HEAD", main, "hash000002")).status, 404);
  assert.equal((await send("GET", "r", "hash000002")).status, 404);

  // The queue falls back to main's entry when its own area has none.
  assert.equal((await send("PUT", main, "hash000003", "main")).status, 202);
  assert.equal(await (await send("GET", queue, "hash000003")).text(), "main");

  // The lookup follows the same rules.
  const hashes = ["hash000001", "hash000002", "hash000003", "hash000004"];
  const seen = (out) => hashes.map((h) => out[h] !== null);
  assert.deepEqual(seen(await lookup(queue, hashes)), [true, true, true, false]);
  assert.deepEqual(seen(await lookup(main, hashes)), [true, false, true, false]);
  assert.deepEqual(seen(await lookup("r", hashes)), [true, false, true, false]);

  // No request can name a q/ key: the path is not a hash.
  for (const token of [main, queue, "r"]) {
    assert.equal((await send("GET", token, "q%2Fhash000002")).status, 404);
    assert.equal((await send("PUT", token, "q%2Fhash000001", "x")).status, 404);
  }
  assert.equal(store.get("hash000001"), "main");
  // The read token still can't upload anywhere.
  assert.equal((await send("PUT", "r", "hash000005", "x")).status, 403);
  assert.equal((await send("PUT", signedToken("r", "k"), "hash000005", "x")).status, 403);
  assert.equal(store.has("q/hash000005") || store.has("hash000005"), false);
});

test("turbo-cache: only a main push OIDC token buys a write token; the merge queue gets a queue token", async () => {
  const store = new Map();
  const env = {
    SPEND_KV: kv({ spend_ok: "on", "spend_ok:turbo-cache": "on" }),
    TURBO_SIGNING_KEY: { get: async () => "signing-key" },
    TURBO_TOKEN_READ: { get: async () => "r" },
    R2_STORE: { put: async (k, b) => store.set(k, b) },
  };
  const exchange = (jwt) =>
    worker.fetch(
      new Request("https://x/auth/github", {
        method: "POST",
        headers: { authorization: `Bearer ${jwt}` },
      }),
      env,
    );
  const put = (token) =>
    worker.fetch(
      new Request("https://x/v8/artifacts/abcdef123456", {
        method: "PUT",
        body: "data",
        headers: { authorization: `Bearer ${token}` },
      }),
      env,
    );

  const main = await exchange(await oidc({ event_name: "push", ref: "refs/heads/main" }));
  assert.equal(main.status, 200);
  const { token } = await main.json();
  assert.equal((await put(token)).status, 202);
  assert.equal((await put(`${token}x`)).status, 401);
  assert.equal(
    (await put(`w.${Math.floor(Date.now() / 1000) - 5}.${token.split(".")[2]}`)).status,
    401,
  );

  assert.equal(store.has("abcdef123456"), true);
  store.clear();

  // The queue runs the queued change's own code, so its token uploads only to the queue's area.
  const queue = await exchange(
    await oidc({ event_name: "merge_group", ref: "refs/heads/gh-readonly-queue/main/x" }),
  );
  assert.equal(queue.status, 200);
  const { token: queueToken } = await queue.json();
  assert.match(queueToken, /^q\./);
  assert.equal((await put(queueToken)).status, 202);
  assert.deepEqual([...store.keys()], ["q/abcdef123456"]);
  // Relabelling the queue token as a write token breaks its signature.
  assert.equal((await put(`w.${queueToken.slice(2)}`)).status, 401);
  assert.deepEqual([...store.keys()], ["q/abcdef123456"]);
  assert.equal(
    (
      await worker.fetch(
        new Request("https://x/v8/artifacts/status", {
          headers: { authorization: `Bearer ${queueToken}` },
        }),
        env,
      )
    ).status,
    200,
  );

  // A merge queue on another branch is not ours.
  assert.equal(
    (
      await exchange(
        await oidc({ event_name: "merge_group", ref: "refs/heads/gh-readonly-queue/dev/x" }),
      )
    ).status,
    403,
  );

  // The attack: a pushed look-alike branch, and every other event, get nothing.
  const fake = { event_name: "push", ref: "refs/heads/gh-readonly-queue/main/x" };
  assert.equal((await exchange(await oidc(fake))).status, 403);
  // A merge_group claim on main itself is not the queue either.
  assert.equal(
    (await exchange(await oidc({ event_name: "merge_group", ref: "refs/heads/main" }))).status,
    403,
  );
  assert.equal(
    (await exchange(await oidc({ event_name: "pull_request", ref: "refs/pull/1/merge" }))).status,
    403,
  );
  assert.equal(
    (
      await exchange(
        await oidc({ event_name: "push", ref: "refs/heads/main", repository: "evil/halonic" }),
      )
    ).status,
    403,
  );
  assert.equal(
    (await exchange(await oidc({ event_name: "push", ref: "refs/heads/main", aud: "other" })))
      .status,
    401,
  );
  assert.equal(
    (await exchange(await oidc({ event_name: "push", ref: "refs/heads/main", exp: 1 }))).status,
    401,
  );
  const [h, p] = (await oidc({ event_name: "push", ref: "refs/heads/main" })).split(".");
  assert.equal((await exchange(`${h}.${p}.${enc("forged")}`)).status, 401);
  assert.equal((await exchange("junk")).status, 401);
  assert.equal(
    (await worker.fetch(new Request("https://x/auth/github", { method: "POST" }), env)).status,
    401,
  );
});
