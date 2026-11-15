import { createHash } from "node:crypto";
import type { CloudflareApi } from "@halonicjs/target-cloudflare-deploy";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import type { CloudflareRest } from "./cloudflare-rest.ts";
import { createCloudflareRest } from "./cloudflare-rest.ts";
import { deployWebhookFixture, type FixtureOptions } from "./fixture.ts";

const script = "export default {};";
const bundle = { script, hash: createHash("sha256").update(script).digest("hex") };

/** The calls of the deploy API the fixture makes, in memory. `failUpload` makes the upload throw. */
function fakes(failUpload = false) {
  const calls: string[] = [];
  const upload: Record<string, unknown> = {};
  let uploaded = false;
  const api = {
    async findResource() {
      return undefined;
    },
    async createResource(_: string, ref: { kind: string; name: string }) {
      calls.push(`create ${ref.kind} ${ref.name}`);
    },
    async deleteResource(_: string, ref: { kind: string; name: string }) {
      calls.push(`delete ${ref.kind} ${ref.name}`);
    },
    async currentDeployment() {
      return uploaded ? [{ id: "v1", percentage: 100 }] : undefined;
    },
    async uploadWorkerLive(_: string, worker: string, body: unknown, migrations: unknown) {
      if (failUpload) throw new Error("upload refused");
      calls.push(`upload ${worker}`);
      uploaded = true;
      Object.assign(upload, { body, migrations });
    },
    async deployVersions() {},
    async workersDevEnabled() {
      return false;
    },
    async openWorkersDev(_: string, worker: string) {
      return `https://${worker}.acme.workers.dev`;
    },
    async workersDevUrl(_: string, worker: string) {
      return `https://${worker}.acme.workers.dev`;
    },
    async closeWorkersDev() {},
  } as unknown as CloudflareApi;
  const objects = new Map<string, string>();
  const rest: CloudflareRest = {
    async d1DatabaseId() {
      return "db-id";
    },
    async workersSubdomain() {
      return "acme";
    },
    async putObject(_, bucket, key, value) {
      calls.push(`put ${bucket} ${key}`);
      objects.set(`${bucket}/${key}`, value);
    },
    async deleteObject(_, bucket, key) {
      calls.push(`delete object ${bucket} ${key}`);
      objects.delete(`${bucket}/${key}`);
    },
  };
  return { api, rest, calls, objects, upload };
}

const options = (
  extra: Pick<FixtureOptions, "api" | "rest"> & Partial<FixtureOptions>,
): FixtureOptions => ({
  accountId: "a1",
  prefix: "hlt-7-1",
  bundle,
  compatibilityDate: "2026-07-30",
  randomSecret: () => "r".repeat(64),
  upload: {
    sleep: async () => {},
    attempts: 1,
    fetch: (async () =>
      new Response(JSON.stringify({ ok: true, checks: [] }))) as unknown as typeof fetch,
  },
  ...extra,
});

verifies("cloudflare-live.fixture", () => {
  it("deploys a prefixed Worker whose only host is its workers.dev address", async () => {
    const f = fakes();
    const fixture = await deployWebhookFixture(options({ api: f.api, rest: f.rest }));
    expect(fixture.env).toEqual({
      HALONIC_LIVE_WORKER_URL: "https://hlt-7-1-w.acme.workers.dev",
      HALONIC_LIVE_WEBHOOK_ADDRESS: "acme/orders",
      HALONIC_LIVE_WEBHOOK_SECRET: "r".repeat(64),
    });
    const created = f.calls.filter((c) => c.startsWith("create "));
    expect(created).toEqual([
      "create database hlt-7-1-w-data",
      "create bucket hlt-7-1-w-blobs",
      "create bucket hlt-7-1-w-defs",
    ]);
    const body = f.upload["body"] as { bindings: { name: string; text?: string }[] };
    expect(body.bindings.find((b) => b.name === "HALONIC_ALLOWED_HOSTS")?.text).toBe(
      "hlt-7-1-w.acme.workers.dev",
    );
    expect([...f.objects.keys()].some((k) => k.endsWith("orders.routine.yaml"))).toBe(true);
  });

  it("deletes the Worker, the snapshot objects, the buckets and the database at the end", async () => {
    const f = fakes();
    const fixture = await deployWebhookFixture(options({ api: f.api, rest: f.rest }));
    await fixture.destroy();
    await fixture.destroy();
    expect(f.objects.size).toBe(0);
    expect(
      f.calls.filter((c) => c.startsWith("delete ") && !c.startsWith("delete object")),
    ).toEqual([
      "delete worker hlt-7-1-w",
      "delete bucket hlt-7-1-w-defs",
      "delete bucket hlt-7-1-w-blobs",
      "delete database hlt-7-1-w-data",
    ]);
  });

  it("deletes what it made when the upload fails, and throws the upload's error", async () => {
    const f = fakes(true);
    await expect(deployWebhookFixture(options({ api: f.api, rest: f.rest }))).rejects.toThrow(
      "upload refused",
    );
    expect(f.calls).toContain("delete database hlt-7-1-w-data");
    expect(f.objects.size).toBe(0);
  });

  it("refuses a prefix that isn't hlt- before it creates anything", async () => {
    const f = fakes();
    await expect(
      deployWebhookFixture(options({ api: f.api, rest: f.rest, prefix: "prod" })),
    ).rejects.toThrow('start with "hlt-"');
    expect(f.calls).toEqual([]);
  });
});

describe("the Cloudflare REST calls", () => {
  const token = ["tok", "en"].join("");

  function client(answers: Record<string, { status?: number; body: unknown }>) {
    const seen: { method: string; url: string; auth: string | null }[] = [];
    const fetchFake = (async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      seen.push({ method, url, auth: new Headers(init?.headers).get("authorization") });
      const answer = answers[`${method} ${new URL(url).pathname}`] ?? { status: 404, body: {} };
      return new Response(JSON.stringify(answer.body), { status: answer.status ?? 200 });
    }) as unknown as typeof fetch;
    return {
      rest: createCloudflareRest({ token, fetch: fetchFake, baseUrl: "https://cf.test/v4" }),
      seen,
    };
  }

  it("reads the database id and the subdomain, and sends the token as a bearer", async () => {
    const { rest, seen } = client({
      "GET /v4/accounts/a1/d1/database": { body: { result: [{ uuid: "u1", name: "x" }] } },
      "GET /v4/accounts/a1/workers/subdomain": { body: { result: { subdomain: "acme" } } },
    });
    expect(await rest.d1DatabaseId("a1", "x")).toBe("u1");
    expect(await rest.workersSubdomain("a1")).toBe("acme");
    expect(seen[0]?.auth).toBe(`Bearer ${token}`);
  });

  it("puts and deletes an object under its encoded key, and treats a missing object as deleted", async () => {
    const path = "/v4/accounts/a1/r2/buckets/b/objects/definitions%2Fcurrent";
    const { rest, seen } = client({ [`PUT ${path}`]: { body: { success: true } } });
    await rest.putObject("a1", "b", "definitions/current", "v");
    await rest.deleteObject("a1", "b", "definitions/current");
    expect(seen.map((s) => s.method)).toEqual(["PUT", "DELETE"]);
  });

  it("names the call and Cloudflare's reason in an error, never the token", async () => {
    const { rest } = client({
      "GET /v4/accounts/a1/workers/subdomain": {
        status: 403,
        body: { success: false, errors: [{ message: "no access" }] },
      },
    });
    const error = await rest.workersSubdomain("a1").catch((e: unknown) => e);
    expect(String(error)).toContain("no access");
    expect(String(error)).not.toContain(token);
  });
});
