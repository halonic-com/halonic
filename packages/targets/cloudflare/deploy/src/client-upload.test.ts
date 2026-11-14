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

  it("hides a secret from a refusal that echoes it escaped or encoded", async () => {
    const odd = ["pa", 'ss"wo rd&'].join("");
    const { client } = setupUpload({
      "PUT /accounts/a1/workers/scripts/w": {
        status: 400,
        success: false,
        errors: [
          { code: 1, message: `json ${JSON.stringify(odd)} url ${encodeURIComponent(odd)}` },
        ],
      },
    });
    const error = await client
      .uploadWorkerLive("a1", "w", { ...upload, secrets: { A_SECRET: odd } }, [])
      .catch((e: unknown) => e);
    expect(String(error)).not.toContain(odd);
    expect(String(error)).not.toContain(encodeURIComponent(odd));
    expect(String(error)).not.toContain(JSON.stringify(odd).slice(1, -1));
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

  it("reads the workers.dev setting and closes it with previews off", async () => {
    const { client, bodies } = setupUpload({
      "GET /accounts/a1/workers/scripts/w/subdomain": { result: { enabled: false } },
      "POST /accounts/a1/workers/scripts/w/subdomain": { result: {} },
    });
    expect(await client.workersDevEnabled("a1", "w")).toBe(false);
    await client.closeWorkersDev("a1", "w");
    expect(bodies[0]).toEqual({ enabled: false, previews_enabled: false });
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
