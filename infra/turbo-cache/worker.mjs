// Minimal Turborepo remote cache: R2 storage, keyed by artifact hash, one team. Reads take a static read token.
// Writes take a short-lived token that POST /auth/github hands out only to a push to main, against a GitHub OIDC token (see below).
// The merge queue writes too, but only to its own area (q/<hash>), which main never reads (HAL-14149).
// Refuses with 503 when the Cloudflare spend switch is off (turbo then builds without the cache).
import { checkSpend, spendOffResponse } from "../spend-guard/src/check-spend.mjs";

const HASH = /^[A-Za-z0-9_-]{8,128}$/;
const ARTIFACT_PATH = /^\/v8\/artifacts\/([^/]+)$/;
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const GITHUB_ISSUER = "https://token.actions.githubusercontent.com";
const OIDC_AUDIENCE = "halonic-turbo-cache";
const OIDC_REPOSITORY = "halonic-com/halonic";
const WRITE_TOKEN_SECONDS = 30 * 60;
const b64 = (s) =>
  Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
const b64url = (bytes) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

let jwksCache = { keys: [], at: 0 };
// An unknown kid forces a refetch; at most one a minute, so a stranger can't make us call GitHub on every request.
async function githubKeys(force) {
  const age = Date.now() - jwksCache.at;
  if (age < (force ? 60_000 : 10 * 60_000)) return jwksCache.keys;
  const res = await fetch(`${GITHUB_ISSUER}/.well-known/jwks`);
  if (!res.ok) throw new Error("jwks");
  jwksCache = { keys: (await res.json()).keys ?? [], at: Date.now() };
  return jwksCache.keys;
}

// The claims of a GitHub Actions OIDC token whose signature, issuer, audience and expiry check out, else null.
async function verifyGithubToken(jwt) {
  try {
    const [h, p, sig] = jwt.split(".");
    const header = JSON.parse(new TextDecoder().decode(b64(h)));
    if (header.alg !== "RS256") return null;
    let jwk = (await githubKeys(false)).find((k) => k.kid === header.kid);
    jwk ??= (await githubKeys(true)).find((k) => k.kid === header.kid);
    if (!jwk) return null;
    const key = await crypto.subtle.importKey(
      "jwk",
      jwk,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const ok = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      key,
      b64(sig),
      new TextEncoder().encode(`${h}.${p}`),
    );
    if (!ok) return null;
    const claims = JSON.parse(new TextDecoder().decode(b64(p)));
    const live = typeof claims.exp === "number" && claims.exp * 1000 > Date.now();
    const audience = [claims.aud].flat().includes(OIDC_AUDIENCE);
    return claims.iss === GITHUB_ISSUER && audience && live ? claims : null;
  } catch {
    return null;
  }
}

// GitHub sets event_name and ref in the token; a workflow file cannot change them. That keeps a workflow on a
// pushed look-alike branch (gh-readonly-queue/main/x) from getting any token: its event is a plain push on another ref.
// Only a push to main writes the shared area. The merge queue runs the queued change's own code, so it writes only
// to its own area (q/<hash>): later queue entries reuse what the ones ahead of them built, and main never trusts it.
function tokenKind(claims) {
  if (claims.repository !== OIDC_REPOSITORY) return null;
  if (claims.event_name === "merge_group")
    return claims.ref?.startsWith("refs/heads/gh-readonly-queue/main/") ? "q" : null;
  return claims.event_name === "push" && claims.ref === "refs/heads/main" ? "w" : null;
}

async function hmac(secret, text) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return b64url(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(text)));
}

// POST /auth/github with the OIDC token as bearer answers { token }: a 30-minute token, "w." (reads and uploads) for
// a push to main, "q." (reads, uploads only to the queue's area) for the merge queue.
async function exchange(request, env) {
  const signingKey = await readSecret(env.TURBO_SIGNING_KEY);
  const jwt = (request.headers.get("authorization") || "").replace(/^Bearer /, "");
  const claims = signingKey && jwt ? await verifyGithubToken(jwt) : null;
  if (!claims) return json({ error: "unauthorized" }, 401);
  const kind = tokenKind(claims);
  if (!kind) return json({ error: "forbidden" }, 403);
  const expires = Math.floor(Date.now() / 1000) + WRITE_TOKEN_SECONDS;
  return json({ token: `${kind}.${expires}.${await hmac(signingKey, `${kind}.${expires}`)}` });
}

// The kind of a live token we signed ("w", "q" or "r"), else null. "r" is no longer handed out; a live one still reads.
async function signedTokenKind(given, env) {
  const [kind, expires, mac] = given.split(".");
  const signingKey = await readSecret(env.TURBO_SIGNING_KEY);
  if (!["w", "q", "r"].includes(kind) || !signingKey || !mac) return null;
  if (Number(expires) * 1000 <= Date.now()) return null;
  return (await matches(
    given,
    `${kind}.${expires}.${await hmac(signingKey, `${kind}.${expires}`)}`,
  ))
    ? kind
    : null;
}

async function matches(given, token) {
  if (!token) return false;
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(given)),
    crypto.subtle.digest("SHA-256", enc.encode(token)),
  ]);
  return crypto.subtle.timingSafeEqual(a, b);
}

// Both tokens are account-level Secrets Store bindings: read them with get(). Any failure fails closed.
async function readSecret(binding) {
  try {
    return await binding?.get();
  } catch {
    return undefined;
  }
}

// "write" (a "w." token from /auth/github: reads and uploads), "queue" (a "q." token from /auth/github: reads,
// uploads to q/ only), "read" (an "r." token, or TURBO_TOKEN_READ: reads only) or null.
async function roleOf(request, env) {
  const given = (request.headers.get("authorization") || "").replace(/^Bearer /, "");
  const kind = await signedTokenKind(given, env);
  if (kind === "w") return "write";
  if (kind === "q") return "queue";
  if (kind === "r") return "read";
  return (await matches(given, await readSecret(env.TURBO_TOKEN_READ))) ? "read" : null;
}

// The R2 keys a role reads for a hash, in order. Only the queue sees q/: main and the read token never do. A hash
// can't contain "/", so no request names a q/ key directly.
const readKeys = (role, hash) => (role === "queue" ? [`q/${hash}`, hash] : [hash]);

async function firstOf(keys, lookup) {
  for (const key of keys) {
    const o = await lookup(key);
    if (o) return o;
  }
  return null;
}

async function query(request, env, role) {
  const { hashes } = await request.json().catch(() => ({}));
  if (!Array.isArray(hashes) || hashes.length > 1000 || !hashes.every((h) => HASH.test(h))) {
    return json({ error: "bad request" }, 400);
  }
  const out = {};
  await Promise.all(
    hashes.map(async (h) => {
      const o = await firstOf(readKeys(role, h), (k) => env.R2_STORE.head(k));
      out[h] = o
        ? { size: o.size, taggedAt: o.uploaded.getTime(), tag: o.customMetadata?.tag }
        : null;
    }),
  );
  return json(out);
}

async function put(request, env, hash, role) {
  if (!request.body) return json({ error: "empty body" }, 400);
  const key = role === "queue" ? `q/${hash}` : hash;
  const tag = request.headers.get("x-artifact-tag") || undefined;
  const length = Number(request.headers.get("content-length"));
  const body = Number.isFinite(length) && length > 0 ? request.body : await request.arrayBuffer();
  await env.R2_STORE.put(key, body, { customMetadata: tag ? { tag } : undefined });
  return json({ urls: [`${new URL(request.url).origin}/v8/artifacts/${hash}`] }, 202);
}

async function read(request, env, hash, role) {
  const isGet = request.method === "GET";
  const o = await firstOf(readKeys(role, hash), (k) =>
    isGet ? env.R2_STORE.get(k) : env.R2_STORE.head(k),
  );
  if (!o) return json({ error: "not found" }, 404);
  const headers = {
    "content-type": "application/octet-stream",
    "content-length": String(o.size),
  };
  if (o.customMetadata?.tag) headers["x-artifact-tag"] = o.customMetadata.tag;
  return new Response(isGet ? o.body : null, { headers });
}

async function route(request, env, role) {
  const { pathname } = new URL(request.url);
  const { method } = request;
  if (pathname === "/v8/artifacts/status" && method === "GET") return json({ status: "enabled" });
  if (pathname === "/v8/artifacts/events" && method === "POST") return json({});
  if (pathname === "/v8/artifacts" && method === "POST") return query(request, env, role);

  const hash = pathname.match(ARTIFACT_PATH)?.[1];
  if (!hash || !HASH.test(hash)) return json({ error: "not found" }, 404);
  if (method === "PUT") {
    return role === "write" || role === "queue"
      ? put(request, env, hash, role)
      : json({ error: "forbidden" }, 403);
  }
  if (method === "GET" || method === "HEAD") return read(request, env, hash, role);
  return json({ error: "method not allowed" }, 405);
}

// A Worker module must default-export its handlers.
// biome-ignore lint/style/noDefaultExport: required by the Workers runtime
export default {
  async fetch(request, env) {
    // The token exchange checks its own OIDC proof and touches no R2, so it comes before the spend check.
    if (request.method === "POST" && new URL(request.url).pathname === "/auth/github") {
      return exchange(request, env);
    }
    // Auth first, so unauthenticated requests cost no KV read. Then the spend check: when paused, R2 never runs.
    const role = await roleOf(request, env);
    if (!role) return json({ error: "unauthorized" }, 401);
    if (!(await checkSpend(env, "turbo-cache"))) return spendOffResponse();
    return route(request, env, role);
  },
};
