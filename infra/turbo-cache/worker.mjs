// Minimal Turborepo remote cache: R2 storage, bearer-token auth. Single team, keyed by artifact hash.
// Refuses with 503 when the Cloudflare spend switch is off (turbo then builds without the cache).
import { checkSpend, spendOffResponse } from "../spend-guard/src/check-spend.mjs";

const HASH = /^[A-Za-z0-9_-]{8,128}$/;
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

async function authorized(request, token) {
  if (!token) return false;
  const given = (request.headers.get("authorization") || "").replace(/^Bearer /, "");
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(given)),
    crypto.subtle.digest("SHA-256", enc.encode(token)),
  ]);
  return crypto.subtle.timingSafeEqual(a, b);
}

// TURBO_TOKEN is an account-level Secrets Store binding: read it with get(). Any failure fails closed (401).
async function readToken(env) {
  try {
    return await env.TURBO_TOKEN.get();
  } catch {
    return undefined;
  }
}

export default {
  async fetch(request, env) {
    // Spend check first: when paused, nothing else (auth, R2) runs.
    if (!(await checkSpend(env, "turbo-cache"))) return spendOffResponse();
    if (!(await authorized(request, await readToken(env))))
      return json({ error: "unauthorized" }, 401);
    const { pathname } = new URL(request.url);
    const { method } = request;

    if (pathname === "/v8/artifacts/status" && method === "GET") return json({ status: "enabled" });
    if (pathname === "/v8/artifacts/events" && method === "POST") return json({});

    if (pathname === "/v8/artifacts" && method === "POST") {
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

    const m = pathname.match(/^\/v8\/artifacts\/([^/]+)$/);
    if (!m || !HASH.test(m[1])) return json({ error: "not found" }, 404);
    const key = m[1];

    if (method === "PUT") {
      if (!request.body) return json({ error: "empty body" }, 400);
      const tag = request.headers.get("x-artifact-tag") || undefined;
      const length = Number(request.headers.get("content-length"));
      const body =
        Number.isFinite(length) && length > 0 ? request.body : await request.arrayBuffer();
      await env.R2_STORE.put(key, body, { customMetadata: tag ? { tag } : undefined });
      return json({ urls: [`${new URL(request.url).origin}/v8/artifacts/${key}`] }, 202);
    }
    if (method === "GET" || method === "HEAD") {
      const o = method === "GET" ? await env.R2_STORE.get(key) : await env.R2_STORE.head(key);
      if (!o) return json({ error: "not found" }, 404);
      const headers = {
        "content-type": "application/octet-stream",
        "content-length": String(o.size),
      };
      if (o.customMetadata?.tag) headers["x-artifact-tag"] = o.customMetadata.tag;
      return new Response(method === "GET" ? o.body : null, { headers });
    }
    return json({ error: "method not allowed" }, 405);
  },
};
