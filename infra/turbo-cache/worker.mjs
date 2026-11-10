// Minimal Turborepo remote cache: R2 storage, two bearer tokens (read, write). Single team, keyed by artifact hash.
// Refuses authorized requests with 503 when the Cloudflare spend switch is off (turbo then builds without the cache).
import { checkSpend, spendOffResponse } from "../spend-guard/src/check-spend.mjs";

const HASH = /^[A-Za-z0-9_-]{8,128}$/;
const ARTIFACT_PATH = /^\/v8\/artifacts\/([^/]+)$/;
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

async function matches(request, token) {
  if (!token) return false;
  const given = (request.headers.get("authorization") || "").replace(/^Bearer /, "");
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

// "write" (TURBO_TOKEN: reads and uploads), "read" (TURBO_TOKEN_READ: reads only) or null.
async function roleOf(request, env) {
  const [write, read] = await Promise.all([
    matches(request, await readSecret(env.TURBO_TOKEN)),
    matches(request, await readSecret(env.TURBO_TOKEN_READ)),
  ]);
  if (write) return "write";
  return read ? "read" : null;
}

async function query(request, env) {
  const { hashes } = await request.json().catch(() => ({}));
  if (!Array.isArray(hashes) || hashes.length > 1000 || !hashes.every((h) => HASH.test(h))) {
    return json({ error: "bad request" }, 400);
  }
  const out = {};
  await Promise.all(
    hashes.map(async (h) => {
      const o = await env.R2_STORE.head(h);
      out[h] = o
        ? { size: o.size, taggedAt: o.uploaded.getTime(), tag: o.customMetadata?.tag }
        : null;
    }),
  );
  return json(out);
}

async function put(request, env, key) {
  if (!request.body) return json({ error: "empty body" }, 400);
  const tag = request.headers.get("x-artifact-tag") || undefined;
  const length = Number(request.headers.get("content-length"));
  const body = Number.isFinite(length) && length > 0 ? request.body : await request.arrayBuffer();
  await env.R2_STORE.put(key, body, { customMetadata: tag ? { tag } : undefined });
  return json({ urls: [`${new URL(request.url).origin}/v8/artifacts/${key}`] }, 202);
}

async function read(request, env, key) {
  const isGet = request.method === "GET";
  const o = isGet ? await env.R2_STORE.get(key) : await env.R2_STORE.head(key);
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
  if (pathname === "/v8/artifacts" && method === "POST") return query(request, env);

  const key = pathname.match(ARTIFACT_PATH)?.[1];
  if (!key || !HASH.test(key)) return json({ error: "not found" }, 404);
  if (method === "PUT") {
    return role === "write" ? put(request, env, key) : json({ error: "forbidden" }, 403);
  }
  if (method === "GET" || method === "HEAD") return read(request, env, key);
  return json({ error: "method not allowed" }, 405);
}

// A Worker module must default-export its handlers.
// biome-ignore lint/style/noDefaultExport: required by the Workers runtime
export default {
  async fetch(request, env) {
    // Auth first, so unauthenticated requests cost no KV read. Then the spend check: when paused, R2 never runs.
    const role = await roleOf(request, env);
    if (!role) return json({ error: "unauthorized" }, 401);
    if (!(await checkSpend(env, "turbo-cache"))) return spendOffResponse();
    return route(request, env, role);
  },
};
