import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { createCloudflareClient } from "./client.ts";

// Built while the test runs, so this file holds no secret-shaped text for the leak guard or `gitleaks`.
const token = ["cfut", "abcdef0123456789"].join("_");

interface Route {
  readonly status?: number;
  readonly result?: unknown;
  readonly success?: boolean;
  readonly errors?: readonly { code: number; message: string }[];
}

/** A fetch that answers by method and path and records what it saw, with request bodies. */
function cloudflare(
  routes: Record<string, Route>,
  seen: string[],
  bodies: { sql?: string; params?: unknown }[] = [],
) {
  return (async (input, init) => {
    const key = `${init?.method ?? "GET"} ${String(input).replace("https://cf.test", "")}`;
    seen.push(key);
    if (typeof init?.body === "string") bodies.push(JSON.parse(init.body));
    const route = routes[key];
    if (!route) return new Response("{}", { status: 404 });
    return new Response(
      JSON.stringify({
        success: route.success ?? true,
        result: route.result,
        errors: route.errors,
      }),
      { status: route.status ?? 200 },
    );
  }) as typeof fetch;
}

const lookup = {
  "GET /accounts/a1/d1/database?name=w-data": { result: [{ uuid: "d1", name: "w-data" }] },
};

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
    expect(seen.at(-1)).toBe("POST /accounts/a1/r2/buckets");
    expect(seen.filter((s) => s.endsWith("/query"))).toHaveLength(2);
  });

  it("sends marker values as bound params, never in the SQL text", async () => {
    const seen: string[] = [];
    const bodies: { sql?: string; params?: unknown }[] = [];
    const client = createCloudflareClient({
      token,
      baseUrl: "https://cf.test",
      fetch: cloudflare(
        { ...lookup, "POST /accounts/a1/d1/database/d1/query": { result: [] } },
        seen,
        bodies,
      ),
    });
    await client.adoptResource("a1", { kind: "database", name: "w-data" });
    await client.findResource("a1", { kind: "database", name: "w-data" });
    const inserts = bodies.filter((b) => String(b.sql).startsWith("INSERT"));
    expect(inserts).toEqual([
      {
        sql: "INSERT OR IGNORE INTO _halonic_marker (resource) VALUES (?)",
        params: ["database:w-data"],
      },
    ]);
    for (const body of bodies) expect(String(body.sql)).not.toContain("w-data");
    expect(bodies.find((b) => String(b.sql).startsWith("SELECT"))?.params).toEqual([
      "database:w-data",
    ]);
  });

  it("treats a missing marker table as not marked", async () => {
    const client = createCloudflareClient({
      token,
      baseUrl: "https://cf.test",
      fetch: cloudflare(
        {
          ...lookup,
          "POST /accounts/a1/d1/database/d1/query": {
            status: 400,
            success: false,
            errors: [{ code: 7500, message: "no such table: _halonic_marker" }],
          },
        },
        [],
      ),
    });
    expect(await client.findResource("a1", { kind: "database", name: "w-data" })).toEqual({
      marked: false,
    });
  });

  it("rethrows any other marker lookup failure", async () => {
    const client = createCloudflareClient({
      token,
      baseUrl: "https://cf.test",
      fetch: cloudflare(
        {
          ...lookup,
          "POST /accounts/a1/d1/database/d1/query": {
            status: 403,
            success: false,
            errors: [{ code: 10000, message: "Authentication error" }],
          },
        },
        [],
      ),
    });
    await expect(client.findResource("a1", { kind: "database", name: "w-data" })).rejects.toThrow(
      /403/,
    );
    const timeout = createCloudflareClient({
      token,
      baseUrl: "https://cf.test",
      fetch: (async (input) => {
        if (String(input).includes("/query")) throw new Error("socket hang up");
        return new Response(
          JSON.stringify({
            success: true,
            result: lookup["GET /accounts/a1/d1/database?name=w-data"].result,
          }),
        );
      }) as typeof fetch,
    });
    await expect(timeout.findResource("a1", { kind: "database", name: "w-data" })).rejects.toThrow(
      /socket hang up/,
    );
  });

  it("marks a bucket before creating it", async () => {
    const seen: string[] = [];
    const client = createCloudflareClient({
      token,
      baseUrl: "https://cf.test",
      fetch: cloudflare(
        {
          ...lookup,
          "POST /accounts/a1/r2/buckets": { result: {} },
          "POST /accounts/a1/d1/database/d1/query": { result: [] },
        },
        seen,
      ),
    });
    await client.createResource("a1", { kind: "bucket", name: "w-blobs", markedIn: "w-data" });
    expect(seen.at(-1)).toBe("POST /accounts/a1/r2/buckets");
  });

  it("leaves no bucket behind when its mark fails", async () => {
    const seen: string[] = [];
    const client = createCloudflareClient({
      token,
      baseUrl: "https://cf.test",
      fetch: cloudflare({ ...lookup, "POST /accounts/a1/r2/buckets": { result: {} } }, seen),
    });
    await expect(
      client.createResource("a1", { kind: "bucket", name: "w-blobs", markedIn: "w-data" }),
    ).rejects.toThrow();
    expect(seen).not.toContain("POST /accounts/a1/r2/buckets");
  });

  it("creates a database, takes its id from the response and marks it", async () => {
    const seen: string[] = [];
    const client = createCloudflareClient({
      token,
      baseUrl: "https://cf.test",
      fetch: cloudflare(
        {
          "POST /accounts/a1/d1/database": { result: { uuid: "new-id" } },
          "POST /accounts/a1/d1/database/new-id/query": { result: [] },
        },
        seen,
      ),
    });
    await client.createResource("a1", { kind: "database", name: "w-data" });
    expect(seen.some((s) => s.includes("GET"))).toBe(false);
    expect(seen.filter((s) => s.endsWith("/new-id/query"))).toHaveLength(2);
  });

  it("adopts a bucket by marking it, and fails when the database is missing", async () => {
    const seen: string[] = [];
    const client = createCloudflareClient({
      token,
      baseUrl: "https://cf.test",
      fetch: cloudflare(
        {
          ...lookup,
          "GET /accounts/a1/d1/database?name=x-data": { result: [] },
          "POST /accounts/a1/d1/database/d1/query": { result: [] },
        },
        seen,
      ),
    });
    await client.adoptResource("a1", { kind: "bucket", name: "w-blobs", markedIn: "w-data" });
    expect(seen.filter((s) => s.endsWith("/query"))).toHaveLength(2);
    await expect(
      client.adoptResource("a1", { kind: "bucket", name: "x-blobs", markedIn: "x-data" }),
    ).rejects.toThrow(/x-data not found/);
  });
});

verifies("deploy.migrate", () => {
  it("reads the applied ids, and treats a missing table as none", async () => {
    const seen: string[] = [];
    const rows = (results: unknown) => ({ result: [{ results }] });
    const run = async (route: Route) => {
      const client = createCloudflareClient({
        token,
        baseUrl: "https://cf.test",
        fetch: cloudflare({ ...lookup, "POST /accounts/a1/d1/database/d1/query": route }, seen),
      });
      return client.appliedMigrations("a1", "w-data");
    };
    expect(await run(rows([{ id: "0001-a" }, { id: "0002-b" }]))).toEqual(["0001-a", "0002-b"]);
    expect(
      await run({
        success: false,
        status: 400,
        errors: [{ code: 7500, message: "no such table: schema_migrations" }],
      }),
    ).toEqual([]);
    await expect(
      run({ success: false, status: 500, errors: [{ code: 1, message: "boom" }] }),
    ).rejects.toThrow(/boom/);
  });

  it("reports a missing database as undefined, not an error", async () => {
    const client = createCloudflareClient({
      token,
      baseUrl: "https://cf.test",
      fetch: cloudflare({ "GET /accounts/a1/d1/database?name=x-data": { result: [] } }, []),
    });
    expect(await client.appliedMigrations("a1", "x-data")).toBeUndefined();
  });

  it("sends a migration and its record as one batch", async () => {
    const seen: string[] = [];
    const bodies: { batch?: { sql: string; params?: unknown }[] }[] = [];
    const client = createCloudflareClient({
      token,
      baseUrl: "https://cf.test",
      fetch: cloudflare(
        { ...lookup, "POST /accounts/a1/d1/database/d1/query": { result: [] } },
        seen,
        bodies as never,
      ),
    });
    await client.applyMigration("a1", "w-data", {
      id: "0001-a",
      statements: ["CREATE TABLE t (x TEXT)"],
    });
    const sent = bodies.at(-1)?.batch ?? [];
    expect(seen.filter((s) => s.endsWith("/query"))).toHaveLength(1);
    expect(sent.map((s) => s.sql.split(" ").slice(0, 3).join(" "))).toEqual([
      "CREATE TABLE IF",
      "CREATE TABLE t",
      "INSERT INTO schema_migrations",
    ]);
    expect(sent.at(-1)?.params).toEqual(["0001-a"]);
  });
});
