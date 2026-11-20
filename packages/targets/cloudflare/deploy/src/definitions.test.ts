import { createHash } from "node:crypto";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { type DeployOptions, deploy } from "./deploy.ts";
import { destroy } from "./destroy.ts";
import { UnmarkedResourcesError } from "./errors.ts";
import { fakeCloudflareApi } from "./fake-api.ts";
import { provision } from "./provision.ts";

const script = "export default {};";
const hash = createHash("sha256").update(script).digest("hex");
const commit = "c0ffee0123456789abcdef0123456789abcdef01";
const routinePath = "hubs/acme/workflows/routines/orders.routine.yaml";
const routineFile = [
  "id: orders",
  "name: Orders",
  "trigger: { webhook: { secret: orders-hook } }",
  "run: { workflow: handle-order }",
].join("\n");

/** A deploy of Worker `w` from `commit`, whose workspace holds one routine file. */
function deployOptions(api: ReturnType<typeof fakeCloudflareApi>): DeployOptions {
  return {
    accountId: "a1",
    worker: "w",
    environment: "production",
    source: {
      commit: async () => commit,
      changedFileCount: async () => 0,
      files: async (at) => (at === commit ? { [routinePath]: routineFile } : {}),
    },
    validate: async () => {},
    test: async () => {},
    prepare: async () => ({
      bundle: { script, hash },
      bindings: [{ type: "r2_bucket", name: "DEFINITIONS", bucket_name: "elsewhere" }],
      secrets: {},
    }),
    migrations: [],
    compatibilityDate: "2026-07-30",
    label: "mateo on test",
    upload: {
      sleep: async () => {},
      attempts: 1,
      fetch: (async () => {
        // The self-test runs after the upload; by then the snapshot must be in place.
        expect(api.objects("w-defs")).toContain("definitions/current");
        return new Response(JSON.stringify({ ok: true, checks: [] }));
      }) as unknown as typeof fetch,
    },
  };
}

verifies("deploy.definitions", () => {
  it("plans and creates the definitions bucket, marked in the database", async () => {
    const planned = await provision(fakeCloudflareApi({ accounts: [], failOnWrite: true }), {
      accountId: "a1",
      worker: "w",
      plan: true,
    });
    expect(planned).toContainEqual({ kind: "bucket", name: "w-defs", action: "create" });

    const api = fakeCloudflareApi({ accounts: [] });
    await provision(api, { accountId: "a1", worker: "w" });
    expect(api.calls).toContain("createResource bucket w-defs");
    expect(await api.findResource("a1", { kind: "bucket", name: "w-defs" })).toEqual({
      marked: true,
    });
  });

  it("refuses an unmarked definitions bucket", async () => {
    const api = fakeCloudflareApi({
      accounts: [],
      resources: { "bucket w-defs": { marked: false } },
    });
    const error = await provision(api, { accountId: "a1", worker: "w" }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(UnmarkedResourcesError);
    expect((error as UnmarkedResourcesError).resources).toEqual([
      { kind: "bucket", name: "w-defs" },
    ]);
  });

  it("writes the commit's snapshot under the lock before the upload, and binds it", async () => {
    const api = fakeCloudflareApi({ accounts: [], deployment: [{ id: "old", percentage: 100 }] });
    const steps: string[] = [];
    await deploy(api, { ...deployOptions(api), onProgress: (event) => steps.push(event.step) });

    const keys = Object.keys(api.written).filter((key) => key.startsWith("w-defs/"));
    expect(keys.some((key) => key.endsWith(routinePath))).toBe(true);
    const at = (call: string) => api.calls.findIndex((c) => c.startsWith(call));
    expect(at("takeDeployLock")).toBeLessThan(at("putObject"));
    expect(at("putObject w-defs definitions/current")).toBeLessThan(at("uploadVersion"));
    expect(steps.indexOf("definitions-written")).toBeLessThan(steps.indexOf("uploaded"));
    expect(api.bindings.at(-1)?.filter((b) => b.name === "DEFINITIONS")).toEqual([
      { type: "r2_bucket", name: "DEFINITIONS", bucket_name: "w-defs" },
    ]);
  });

  it("plan writes no snapshot", async () => {
    const api = fakeCloudflareApi({ accounts: [], failOnWrite: true, noDatabase: true });
    const result = await deploy(api, { ...deployOptions(api), plan: true });
    expect(result.mode).toBe("plan");
    expect(Object.keys(api.written)).toEqual([]);
  });

  it("destroy empties the definitions bucket, never the blobs", async () => {
    const api = fakeCloudflareApi({
      accounts: [],
      resources: {
        "worker w": { marked: true },
        "bucket w-defs": { marked: true },
        "bucket w-blobs": { marked: true },
        "database w-data": { marked: true },
      },
      objects: { "w-defs": ["definitions/current"] },
    });
    await destroy(api, { accountId: "a1", worker: "w", label: "l", confirm: async () => true });
    const writes = api.calls.filter((c) => /^(emptyBucket|deleteResource bucket)/.test(c));
    expect(writes).toEqual([
      "emptyBucket w-defs",
      "deleteResource bucket w-defs",
      "deleteResource bucket w-blobs",
    ]);
  });
});
