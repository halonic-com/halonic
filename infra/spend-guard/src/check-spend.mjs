// Shared spend check. Every Worker that does billable work calls this first.
// Fails safe: only the exact value "on" for both the account switch and the
// service's own switch counts as on. A missing key, a KV error or any other
// value counts as off. Bind the namespace as SPEND_KV.
//
// KV reads are edge-cached for 60 s (the KV minimum), so a stop reaches every
// Worker within about a minute.

const CACHE_TTL_SECONDS = 60;

export async function checkSpend(env, service) {
  try {
    const kv = env?.SPEND_KV;
    if (!kv) return false;
    const reads = [kv.get("spend_ok", { cacheTtl: CACHE_TTL_SECONDS })];
    if (service) reads.push(kv.get(`spend_ok:${service}`, { cacheTtl: CACHE_TTL_SECONDS }));
    const values = await Promise.all(reads);
    return values.every((value) => value === "on");
  } catch {
    return false;
  }
}

/** The answer a Worker gives when the switch is off. */
export function spendOffResponse() {
  return new Response(JSON.stringify({ error: "spend limit reached; service paused" }), {
    status: 503,
    headers: { "content-type": "application/json", "retry-after": "900" },
  });
}
