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

verifies("deploy.lock", () => {
  const lease = { id: "mine", label: "mateo on laptop", leaseMs: 600_000 };
  const row = (id: string) => ({
    result: [
      { results: [] },
      { results: [] },
      { results: [{ id, label: "ana", started_at: 1000, expires_at: 2000 }] },
    ],
  });

  it("takes the lock in one conditional batch and returns the lease in force", async () => {
    const seen: string[] = [];
    const bodies: { batch?: { sql: string; params?: unknown }[] }[] = [];
    const client = createCloudflareClient({
      token,
      baseUrl: "https://cf.test",
      fetch: cloudflare(
        { ...lookup, "POST /accounts/a1/d1/database/d1/query": row("other") },
        seen,
        bodies as never,
      ),
    });
    const held = await client.takeDeployLock("a1", "w-data", lease);
    expect(held).toEqual({ id: "other", label: "ana", startedAt: 1000, expiresAt: 2000 });
    const batch = bodies[0]?.batch ?? [];
    expect(batch).toHaveLength(3);
    expect(batch[1]?.sql).toMatch(
      /ON CONFLICT\(slot\) DO UPDATE .* WHERE .*expires_at <= excluded\.started_at/,
    );
    // The database's clock sets the times; only the lease length is sent.
    expect(batch[1]?.sql).toContain("strftime('%s','now')");
    expect(batch[1]?.params).toEqual(["mine", "mateo on laptop", "600000"]);
    expect(JSON.stringify(batch)).not.toContain(token);
  });

  it("renews only its own lease, and frees only its own lease", async () => {
    const seen: string[] = [];
    const bodies: { batch?: unknown[]; sql?: string; params?: unknown }[] = [];
    const client = createCloudflareClient({
      token,
      baseUrl: "https://cf.test",
      fetch: cloudflare(
        {
          ...lookup,
          "POST /accounts/a1/d1/database/d1/query": {
            result: [
              { results: [] },
              { results: [{ id: "mine", label: "x", started_at: 1, expires_at: 2 }] },
            ],
          },
        },
        seen,
        bodies as never,
      ),
    });
    expect(await client.renewDeployLock("a1", "w-data", "mine", 9_000)).toEqual({
      id: "mine",
      label: "x",
      startedAt: 1,
      expiresAt: 2,
    });
    expect(await client.renewDeployLock("a1", "w-data", "someone-else", 9_000)).toBeUndefined();
    await client.releaseDeployLock("a1", "w-data", "mine");
    const release = bodies.at(-1);
    expect(release?.sql).toMatch(/DELETE FROM _halonic_deploy_lock WHERE slot = 1 AND id = \?/);
    expect(release?.params).toEqual(["mine"]);
  });

  it("fails when the lock can't be read back", async () => {
    const client = createCloudflareClient({
      token,
      baseUrl: "https://cf.test",
      fetch: cloudflare(
        { ...lookup, "POST /accounts/a1/d1/database/d1/query": { result: [] } },
        [],
      ),
    });
    await expect(client.takeDeployLock("a1", "w-data", lease)).rejects.toThrow(/read back/);
  });
});

async function metadataOf(form: FormData | undefined) {
  const part = form?.get("metadata");
  if (!(part instanceof Blob)) throw new Error("no metadata part");
  return JSON.parse(await part.text());
}

verifies("deploy.upload", () => {
  const setupUpload = (routes: Record<string, Route>) => {
    const seen: string[] = [];
    const forms: FormData[] = [];
    const bodies: unknown[] = [];
    const inner = cloudflare(routes, seen, bodies as never[]);
    const fetched = (async (input, init) => {
      if (init?.body instanceof FormData) forms.push(init.body);
      return inner(input, init);
    }) as typeof fetch;
    return {
      seen,
      forms,
      bodies,
      client: createCloudflareClient({ token, baseUrl: "https://cf.test", fetch: fetched }),
    };
  };
  const upload = {
    script: "export default {};",
    compatibilityDate: "2026-07-30",
    bindings: [{ type: "d1", name: "DB", id: "d1" }],
    secrets: { A_SECRET: "s3cret-value" },
  };

  it("uploads a version with its secrets as bindings and returns its id", async () => {
    const { client, forms, seen } = setupUpload({
      "POST /accounts/a1/workers/scripts/w/versions": { result: { id: "v9" } },
    });
    expect(await client.uploadVersion("a1", "w", upload)).toBe("v9");
    expect(seen).toEqual(["POST /accounts/a1/workers/scripts/w/versions"]);
    const metadata = await metadataOf(forms[0]);
    expect(metadata.main_module).toBe("worker.js");
    expect(metadata.bindings).toContainEqual({
      type: "secret_text",
      name: "A_SECRET",
      text: "s3cret-value",
    });
    expect(metadata.migrations).toBeUndefined();
    expect(forms[0]?.get("worker.js")).toBeInstanceOf(Blob);
  });

  it("hides an upload's secrets from a refusal that echoes them", async () => {
    const { client } = setupUpload({
      "POST /accounts/a1/workers/scripts/w/versions": {
        status: 400,
        success: false,
        errors: [{ code: 10021, message: "bad binding s3cret-value" }],
      },
    });
    const error = await client.uploadVersion("a1", "w", upload).catch((e: unknown) => e);
    expect(String(error)).not.toContain("s3cret-value");
    expect(String(error)).toContain("[redacted]");
  });

  it("uploads live with the migration and the Halonic tag", async () => {
    const { client, forms } = setupUpload({
      "PUT /accounts/a1/workers/scripts/w": { result: {} },
    });
    await client.uploadWorkerLive("a1", "w", upload, [{ tag: "v1", new_sqlite_classes: ["A"] }]);
    const metadata = await metadataOf(forms[0]);
    expect(metadata.migrations).toEqual({ new_tag: "v1", new_sqlite_classes: ["A"] });
    expect(metadata.tags).toEqual(["halonic"]);
  });

  it("leaves out migrations when a live upload has none", async () => {
    const { client, forms } = setupUpload({
      "PUT /accounts/a1/workers/scripts/w": { result: {} },
    });
    await client.uploadWorkerLive("a1", "w", upload, []);
    const metadata = await metadataOf(forms[0]);
    expect(metadata).not.toHaveProperty("migrations");
    expect(metadata.tags).toEqual(["halonic"]);
  });

  it("reads the newest deployment and treats none as undefined", async () => {
    const { client } = setupUpload({
      "GET /accounts/a1/workers/scripts/w/deployments": {
        result: { deployments: [{ versions: [{ version_id: "v1", percentage: 100 }] }] },
      },
    });
    expect(await client.currentDeployment("a1", "w")).toEqual([{ id: "v1", percentage: 100 }]);
    expect(await client.currentDeployment("a1", "none")).toBeUndefined();
  });

  it("deploys by percentage and opens workers.dev with previews off", async () => {
    const { client, bodies } = setupUpload({
      "POST /accounts/a1/workers/scripts/w/deployments": { result: {} },
      "POST /accounts/a1/workers/scripts/w/subdomain": { result: {} },
      "GET /accounts/a1/workers/subdomain": { result: { subdomain: "acme" } },
    });
    await client.deployVersions("a1", "w", [{ id: "v1", percentage: 100 }]);
    expect(await client.openWorkersDev("a1", "w")).toBe("https://w.acme.workers.dev");
    expect(bodies[0]).toEqual({
      strategy: "percentage",
      versions: [{ version_id: "v1", percentage: 100 }],
    });
    expect(bodies[1]).toEqual({ enabled: true, previews_enabled: false });
  });
});
