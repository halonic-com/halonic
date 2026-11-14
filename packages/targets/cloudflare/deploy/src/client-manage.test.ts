import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { createCloudflareClient } from "./client.ts";

// Built while the test runs, so this file holds no secret-shaped text for the leak guard or `gitleaks`.
const token = ["cfut", "abcdef0123456789"].join("_");

interface Route {
  readonly status?: number;
  readonly result?: unknown;
  readonly errors?: readonly { code: number; message: string }[];
}

function client(routes: Record<string, Route>, seen: string[]) {
  const fetched = (async (input, init) => {
    const key = `${init?.method ?? "GET"} ${String(input).replace("https://cf.test", "")}`;
    seen.push(key);
    const route = routes[key];
    if (!route) return new Response("{}", { status: 404 });
    const status = route.status ?? 200;
    return new Response(
      JSON.stringify({ success: status < 400, result: route.result, errors: route.errors }),
      { status },
    );
  }) as typeof fetch;
  return createCloudflareClient({ token, fetch: fetched, baseUrl: "https://cf.test" });
}

const worker = "/accounts/a1/workers/scripts/w";

verifies("deploy.status", () => {
  it("reads versions, deployment history and the workers.dev address without writing", async () => {
    const seen: string[] = [];
    const api = client(
      {
        [`GET ${worker}/deployments`]: {
          result: {
            deployments: [
              { versions: [{ version_id: "v2", percentage: 100 }] },
              { versions: [{ version_id: "v1", percentage: 100 }] },
            ],
          },
        },
        [`GET ${worker}/versions/v2`]: {
          result: {
            annotations: { "workers/message": "halonic abc abc" },
            metadata: { created_on: "2026-11-14T10:00:00Z" },
          },
        },
        [`GET ${worker}/subdomain`]: { result: { enabled: true } },
        "GET /accounts/a1/workers/subdomain": { result: { subdomain: "acme" } },
      },
      seen,
    );
    expect(await api.deploymentHistory("a1", "w")).toEqual([
      [{ id: "v2", percentage: 100 }],
      [{ id: "v1", percentage: 100 }],
    ]);
    expect(await api.currentDeployment("a1", "w")).toEqual([{ id: "v2", percentage: 100 }]);
    expect(await api.versionInfo("a1", "w", "v2")).toEqual({
      id: "v2",
      message: "halonic abc abc",
      createdAt: Date.parse("2026-11-14T10:00:00Z"),
    });
    expect(await api.versionInfo("a1", "w", "gone")).toBeUndefined();
    expect(await api.workersDevUrl("a1", "w")).toBe("https://w.acme.workers.dev");
    expect(seen.every((s) => s.startsWith("GET "))).toBe(true);
  });

  it("gives no workers.dev address when it is off", async () => {
    const api = client({ [`GET ${worker}/subdomain`]: { result: { enabled: false } } }, []);
    expect(await api.workersDevUrl("a1", "w")).toBeUndefined();
  });
});

verifies("deploy.destroy", () => {
  it("lists by prefix for each kind", async () => {
    const api = client(
      {
        "GET /accounts/a1/workers/scripts": {
          result: [
            { id: "hlt-1-1-w", created_on: "2026-11-14T10:00:00Z" },
            { id: "prod", created_on: "2026-11-14T10:00:00Z" },
          ],
        },
        "GET /accounts/a1/d1/database?name=hlt-&per_page=100&page=1": {
          result: [{ name: "hlt-1-1-w-data", created_at: "2026-11-14T10:00:00Z" }],
        },
        "GET /accounts/a1/r2/buckets?name_contains=hlt-&per_page=100&page=1": {
          result: { buckets: [{ name: "hlt-1-1-w-blobs", creation_date: "2026-11-14T10:00:00Z" }] },
        },
      },
      [],
    );
    expect((await api.listResources("a1", "worker", "hlt-")).map((r) => r.name)).toEqual([
      "hlt-1-1-w",
    ]);
    expect((await api.listResources("a1", "database", "hlt-")).map((r) => r.name)).toEqual([
      "hlt-1-1-w-data",
    ]);
    expect((await api.listResources("a1", "bucket", "hlt-")).map((r) => r.name)).toEqual([
      "hlt-1-1-w-blobs",
    ]);
  });

  it("deletes each kind, and treats a missing one as done", async () => {
    const seen: string[] = [];
    const api = client(
      {
        [`DELETE ${worker}?force=true`]: {},
        "GET /accounts/a1/d1/database?name=w-data": { result: [{ uuid: "d1", name: "w-data" }] },
        "DELETE /accounts/a1/d1/database/d1": {},
      },
      seen,
    );
    await api.deleteResource("a1", { kind: "worker", name: "w" });
    await api.deleteResource("a1", { kind: "database", name: "w-data" });
    await api.deleteResource("a1", { kind: "bucket", name: "gone" });
    expect(seen).toContain(`DELETE ${worker}?force=true`);
    expect(seen).toContain("DELETE /accounts/a1/d1/database/d1");
  });

  it("says a full bucket is not empty", async () => {
    const api = client(
      {
        "DELETE /accounts/a1/r2/buckets/b": {
          status: 409,
          errors: [{ code: 10008, message: "The bucket you tried to delete is not empty." }],
        },
      },
      [],
    );
    await expect(api.deleteResource("a1", { kind: "bucket", name: "b" })).rejects.toMatchObject({
      code: "bucket-not-empty",
    });
  });
});
