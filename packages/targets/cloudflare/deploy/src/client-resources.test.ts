import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { createCloudflareClient } from "./client.ts";

// Built while the test runs, so this file holds no secret-shaped text for the leak guard or `gitleaks`.
const token = ["cfut", "abcdef0123456789"].join("_");

/** A fetch that answers by method and path and records what it saw. */
function cloudflare(routes: Record<string, { status?: number; result: unknown }>, seen: string[]) {
  return (async (input, init) => {
    const key = `${init?.method ?? "GET"} ${String(input).replace("https://cf.test", "")}`;
    seen.push(key);
    const route = routes[key];
    if (!route) return new Response("{}", { status: 404 });
    return new Response(JSON.stringify({ success: true, result: route.result }), {
      status: route.status ?? 200,
    });
  }) as typeof fetch;
}

verifies("deploy.provision", () => {
  it("reads a worker's mark from its tags and treats a 404 as missing", async () => {
    const seen: string[] = [];
    const client = createCloudflareClient({
      token,
      baseUrl: "https://cf.test",
      fetch: cloudflare(
        { "GET /accounts/a1/workers/scripts/w/script-settings": { result: { tags: ["halonic"] } } },
        seen,
      ),
    });
    expect(await client.findResource("a1", { kind: "worker", name: "w" })).toEqual({
      marked: true,
    });
    expect(await client.findResource("a1", { kind: "worker", name: "none" })).toBeUndefined();
  });

  it("reads a database's mark from the marker table", async () => {
    const seen: string[] = [];
    const client = createCloudflareClient({
      token,
      baseUrl: "https://cf.test",
      fetch: cloudflare(
        {
          "GET /accounts/a1/d1/database?name=w-data": { result: [{ uuid: "d1", name: "w-data" }] },
          "POST /accounts/a1/d1/database/d1/query": { result: [{ results: [{ found: 1 }] }] },
        },
        seen,
      ),
    });
    expect(await client.findResource("a1", { kind: "database", name: "w-data" })).toEqual({
      marked: true,
    });
  });

  it("creates a bucket and marks it in the database", async () => {
    const seen: string[] = [];
    const client = createCloudflareClient({
      token,
      baseUrl: "https://cf.test",
      fetch: cloudflare(
        {
          "POST /accounts/a1/r2/buckets": { result: {} },
          "GET /accounts/a1/d1/database?name=w-data": { result: [{ uuid: "d1", name: "w-data" }] },
          "POST /accounts/a1/d1/database/d1/query": { result: [] },
        },
        seen,
      ),
    });
    await client.createResource("a1", { kind: "bucket", name: "w-blobs", markedIn: "w-data" });
    expect(seen[0]).toBe("POST /accounts/a1/r2/buckets");
    expect(seen.filter((s) => s.endsWith("/query"))).toHaveLength(2);
  });
});
