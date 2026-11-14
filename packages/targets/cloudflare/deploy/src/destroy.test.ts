import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { destroy } from "./destroy.ts";
import type { DeployError } from "./errors.ts";
import { fakeCloudflareApi } from "./fake-api.ts";
import { cloudflareSweeper } from "./sweeper.ts";

const base = {
  accountId: "a1",
  worker: "halonic-dev",
  label: "mateo on laptop",
  id: "mine",
  confirm: async () => true,
};
const ours = {
  "worker halonic-dev": { marked: true },
  "bucket halonic-dev-blobs": { marked: true },
  "database halonic-dev-data": { marked: true },
};
const deletes = (calls: string[]) => calls.filter((c) => c.startsWith("deleteResource"));

verifies("deploy.destroy", () => {
  it("deletes the Worker, then the bucket, then the database, after confirming", async () => {
    const api = fakeCloudflareApi({ accounts: [], resources: ours });
    const asked: number[] = [];
    const result = await destroy(api, {
      ...base,
      confirm: async (steps) => {
        asked.push(steps.length);
        return true;
      },
    });
    expect(result.mode).toBe("destroyed");
    expect(asked).toEqual([3]);
    expect(deletes(api.calls)).toEqual([
      "deleteResource worker halonic-dev",
      "deleteResource bucket halonic-dev-blobs",
      "deleteResource database halonic-dev-data",
    ]);
  });

  it("deletes nothing when the answer is no", async () => {
    const api = fakeCloudflareApi({ accounts: [], resources: ours });
    const result = await destroy(api, { ...base, confirm: async () => false });
    expect(result.mode).toBe("cancelled");
    expect(deletes(api.calls)).toEqual([]);
    expect(api.calls.some((c) => c.startsWith("takeDeployLock"))).toBe(false);
  });

  it("refuses a resource that isn't ours before deleting anything", async () => {
    const api = fakeCloudflareApi({
      accounts: [],
      resources: { ...ours, "bucket halonic-dev-blobs": { marked: false } },
    });
    const error = (await destroy(api, base).catch((e: unknown) => e)) as DeployError;
    expect(error.code).toBe("destroy-refused");
    expect(error.message).toContain("bucket halonic-dev-blobs");
    expect(deletes(api.calls)).toEqual([]);
  });

  it("skips what is already gone, so a second run finishes the first", async () => {
    const api = fakeCloudflareApi({
      accounts: [],
      resources: {
        "bucket halonic-dev-blobs": { marked: true },
        "database halonic-dev-data": { marked: true },
      },
    });
    const result = await destroy(api, base);
    expect(result.steps[0]).toMatchObject({ kind: "worker", action: "skip" });
    expect(deletes(api.calls)).toHaveLength(2);
  });

  it("frees the lock when the bucket holds files", async () => {
    const api = fakeCloudflareApi({
      accounts: [],
      resources: ours,
      fullBucket: "halonic-dev-blobs",
    });
    const error = (await destroy(api, base).catch((e: unknown) => e)) as DeployError;
    expect(error.code).toBe("bucket-not-empty");
    expect(api.calls).toContain("releaseDeployLock mine");
    expect(deletes(api.calls)).toEqual(["deleteResource worker halonic-dev"]);
  });

  it("stops with deploy-locked while a deploy runs", async () => {
    const api = fakeCloudflareApi({
      accounts: [],
      resources: ours,
      lock: { id: "other", label: "ana", startedAt: Date.now(), expiresAt: Date.now() + 60_000 },
    });
    const error = (await destroy(api, base).catch((e: unknown) => e)) as DeployError;
    expect(error.code).toBe("deploy-locked");
    expect(deletes(api.calls)).toEqual([]);
  });

  it("plan lists and changes nothing", async () => {
    const api = fakeCloudflareApi({ accounts: [], resources: ours, failOnWrite: true });
    const result = await destroy(api, {
      ...base,
      plan: true,
      confirm: async () => {
        throw new Error("asked");
      },
    });
    expect(result.mode).toBe("plan");
  });

  it("the sweeper lists and deletes only its prefix", async () => {
    const old = Date.now() - 3 * 3_600_000;
    const api = fakeCloudflareApi({
      accounts: [],
      listed: [
        { kind: "worker", name: "hlt-1-1-worker", createdAt: old },
        { kind: "bucket", name: "hlt-1-1-worker-blobs", createdAt: old },
        { kind: "worker", name: "halonic-dev", createdAt: old },
      ],
    });
    const sweeper = cloudflareSweeper(api, "a1");
    const listed = await sweeper.list();
    expect(listed.map((r) => r.name)).toEqual(["hlt-1-1-worker", "hlt-1-1-worker-blobs"]);
    expect(listed[0]?.createdAt).toEqual(new Date(old));
    await sweeper.destroy({ kind: "worker", name: "hlt-1-1-worker" });
    await expect(sweeper.destroy({ kind: "worker", name: "halonic-dev" })).rejects.toThrow(
      RangeError,
    );
    expect(deletes(api.calls)).toEqual(["deleteResource worker hlt-1-1-worker"]);
  });
});
