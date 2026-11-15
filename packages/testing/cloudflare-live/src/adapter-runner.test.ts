import type { CloudflareApi } from "@halonicjs/target-cloudflare-deploy";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { deployAdapterRunner } from "./adapter-runner.ts";
import type { CloudflareRest } from "./cloudflare-rest.ts";

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
    async uploadWorkerLive(_: string, __: string, body: unknown, migrations: unknown) {
      if (failUpload) throw new Error("upload refused");
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
  const rest = {
    async d1DatabaseId() {
      return "db-id";
    },
    async workersSubdomain() {
      return "acme";
    },
    async deleteObject() {},
    async emptyBucket(_: string, bucket: string) {
      calls.push(`empty ${bucket}`);
    },
  } as unknown as CloudflareRest;
  return { api, rest, calls, upload };
}

const script = "export default {};";
const options = (f: ReturnType<typeof fakes>, prefix = "hlt-7-1-adapters") => ({
  api: f.api,
  rest: f.rest,
  accountId: "a1",
  prefix,
  script,
  compatibilityDate: "2026-07-30",
  randomSecret: () => "r".repeat(64),
  upload: {
    sleep: async () => {},
    attempts: 1,
    fetch: (async () => Response.json({ ok: true, checks: [] })) as unknown as typeof fetch,
  },
});

verifies("cloudflare-live.adapters", () => {
  it("deploys a prefixed Worker with D1, two buckets and the runner's token", async () => {
    const f = fakes();
    const runner = await deployAdapterRunner(options(f));
    expect(runner.url).toBe("https://hlt-7-1-adapters-w.acme.workers.dev");
    expect(runner.token).toBe("r".repeat(64));
    expect(f.calls.filter((c) => c.startsWith("create "))).toEqual([
      "create database hlt-7-1-adapters-w-data",
      "create bucket hlt-7-1-adapters-w-blobs",
      "create bucket hlt-7-1-adapters-w-defs",
    ]);
    const body = f.upload["body"] as {
      bindings: { name: string }[];
      secrets: Record<string, string>;
    };
    expect(body.bindings.map((b) => b.name)).toEqual(["DB", "BLOBS", "DEFINITIONS"]);
    expect(body.secrets["HALONIC_TEST_RUNNER_TOKEN"]).toBe("r".repeat(64));
  });

  it("deletes the Worker, the buckets and the database at the end, once", async () => {
    const f = fakes();
    const runner = await deployAdapterRunner(options(f));
    await runner.destroy();
    await runner.destroy();
    expect(f.calls.filter((c) => c.startsWith("delete "))).toEqual([
      "delete worker hlt-7-1-adapters-w",
      "delete bucket hlt-7-1-adapters-w-defs",
      "delete bucket hlt-7-1-adapters-w-blobs",
      "delete database hlt-7-1-adapters-w-data",
    ]);
  });

  it("deletes what it made when the upload fails, and throws the upload's error", async () => {
    const f = fakes(true);
    await expect(deployAdapterRunner(options(f))).rejects.toThrow("upload refused");
    expect(f.calls).toContain("delete database hlt-7-1-adapters-w-data");
  });

  it("refuses a prefix without hlt- before it creates anything", async () => {
    const f = fakes();
    await expect(deployAdapterRunner(options(f, "prod"))).rejects.toThrow("hlt-");
    expect(f.calls).toEqual([]);
  });
});
