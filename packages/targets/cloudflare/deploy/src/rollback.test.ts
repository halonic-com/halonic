import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import type { DeployError } from "./errors.ts";
import { fakeCloudflareApi } from "./fake-api.ts";
import { rollback } from "./rollback.ts";

const base = {
  accountId: "a1",
  worker: "halonic-dev",
  label: "mateo on laptop",
  lock: { id: "mine", schedule: () => () => {} },
  fetch: (async () => Response.json({ status: "ok" })) as typeof fetch,
};
const database = { "database halonic-dev-data": { marked: true } };

verifies("deploy.rollback", () => {
  it("switches back to the previous version and reports health", async () => {
    const api = fakeCloudflareApi({
      accounts: [],
      resources: database,
      deployment: [{ id: "B", percentage: 100 }],
      earlier: [[{ id: "A", percentage: 100 }]],
    });
    const result = await rollback(api, base);
    expect(result).toMatchObject({
      mode: "rolled-back",
      from: [{ id: "B", percentage: 100 }],
      to: [{ id: "A", percentage: 100 }],
      health: { state: "ok" },
    });
    expect(api.calls).toContain("deployVersions A:100");
    expect(api.calls.at(-1)).toBe("workersDevUrl halonic-dev");
    expect(api.calls).toContain("releaseDeployLock mine");
  });

  it("skips a version that only ever had no traffic", async () => {
    const api = fakeCloudflareApi({
      accounts: [],
      resources: database,
      deployment: [{ id: "B", percentage: 100 }],
      earlier: [
        [
          { id: "B", percentage: 100 },
          { id: "C", percentage: 0 },
        ],
        [{ id: "B", percentage: 100 }],
        [{ id: "A", percentage: 100 }],
      ],
    });
    expect((await rollback(api, base)).to).toEqual([{ id: "A", percentage: 100 }]);
  });

  it("stops when no earlier version served, and writes nothing", async () => {
    const api = fakeCloudflareApi({
      accounts: [],
      resources: database,
      deployment: [{ id: "A", percentage: 100 }],
    });
    const error = (await rollback(api, base).catch((e: unknown) => e)) as DeployError;
    expect(error.code).toBe("nothing-to-roll-back");
    expect(api.calls.some((c) => c.startsWith("deployVersions"))).toBe(false);
  });

  it("says not-deployed when the database is missing", async () => {
    const api = fakeCloudflareApi({ accounts: [] });
    const error = (await rollback(api, base).catch((e: unknown) => e)) as DeployError;
    expect(error.code).toBe("not-deployed");
  });

  it("stops with deploy-locked when another deploy holds the lock", async () => {
    const api = fakeCloudflareApi({
      accounts: [],
      resources: database,
      deployment: [{ id: "B", percentage: 100 }],
      earlier: [[{ id: "A", percentage: 100 }]],
      lock: { id: "other", label: "ana", startedAt: Date.now(), expiresAt: Date.now() + 60_000 },
    });
    const error = (await rollback(api, base).catch((e: unknown) => e)) as DeployError;
    expect(error.code).toBe("deploy-locked");
    expect(api.calls.some((c) => c.startsWith("deployVersions"))).toBe(false);
  });

  it("plan names the versions and changes nothing", async () => {
    const api = fakeCloudflareApi({
      accounts: [],
      resources: database,
      deployment: [{ id: "B", percentage: 100 }],
      earlier: [[{ id: "A", percentage: 100 }]],
      failOnWrite: true,
    });
    expect(await rollback(api, { ...base, plan: true })).toMatchObject({
      mode: "plan",
      to: [{ id: "A", percentage: 100 }],
    });
  });
});
