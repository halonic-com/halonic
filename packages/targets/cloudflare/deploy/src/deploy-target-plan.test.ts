import { migrations } from "@halonicjs/adapter-cloudflare-storage";
import type { DeploymentRef, DeployRequest } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import type { CloudflareApi } from "./api.ts";
import { createCloudflareDeployTarget, tokenName } from "./deploy-target-entry.ts";
import { type FakeCloudflareState, fakeCloudflareApi } from "./fake-api.ts";
import { versionNote } from "./version-note.ts";
import { FilesSource } from "./write-workspace-snapshot.ts";

const web: DeploymentRef = {
  name: "web",
  accountId: "a1",
  service: "acme",
  environment: "production",
};
const accounts = [{ id: "a1", name: "sam@example.com's Account" }];
const commit = "0123456789abcdef0123456789abcdef01234567";
const marked = { marked: true };
const existing = {
  "database acme-data": marked,
  "bucket acme-blobs": marked,
  "bucket acme-defs": marked,
  "worker acme": marked,
};
const request: DeployRequest = {
  deployment: web,
  snapshot: {
    commit,
    files: new FilesSource({ "halonic.yaml": "name: acme\n", "hubs/ops/hub.yaml": "id: ops\n" }),
    halonicVersion: "0.2.0",
  },
  secrets: new Map([["HALONIC_SECRET_TOKEN_KEY", "not-shown"]]),
  reaches: [{ address: "api.anthropic.com", secret: "ANTHROPIC_API_KEY" }],
};

function setup(state: Partial<FakeCloudflareState>, wrap = (api: CloudflareApi) => api) {
  const api = fakeCloudflareApi({ accounts, failOnWrite: true, ...state });
  const target = createCloudflareDeployTarget(
    {
      http: { fetch: async () => Response.json({ status: "ok" }) },
      tokens: {
        get: async (name) => (name === tokenName ? "saved-token" : null),
        set: async () => {},
        remove: async () => {},
      },
      environmentToken: undefined,
      who: "sam@example.com",
    },
    { api: () => wrap(api) },
  );
  return { api, target };
}

verifies("deploy.plan", () => {
  it("lists everything a first deploy creates and every database change, and writes nothing", async () => {
    const { target, api } = setup({ noDatabase: true, workersDevOff: true });
    const plan = await target.plan(request);
    expect(plan).toEqual({
      account: { id: "a1", name: "sam@example.com's Account" },
      url: undefined,
      creates: [
        { kind: "database", name: "acme-data" },
        { kind: "bucket", name: "acme-blobs" },
        { kind: "bucket", name: "acme-defs" },
        { kind: "service", name: "acme" },
      ],
      databaseChanges: migrations.map((migration) => migration.id),
      deletesData: false,
      live: undefined,
      liveReaches: undefined,
      lockedBy: undefined,
      unchanged: false,
      files: ["halonic.yaml", "hubs/ops/hub.yaml"],
    });
    expect(api.calls.filter((call) => /DeployLock /.test(call))).toEqual([]);
  });

  it("measures against the live version, and isn't unchanged while its Halonic version is unknown", async () => {
    const { target } = setup({
      resources: existing,
      applied: migrations.map((migration) => migration.id),
      earlier: [[{ id: "A", percentage: 100 }]],
      deployment: [{ id: "B", percentage: 100 }],
      versionMessages: { B: versionNote({ commit, bundleHash: "f".repeat(64) }) },
    });
    const plan = await target.plan(request);
    expect(plan.creates).toEqual([]);
    expect(plan.databaseChanges).toEqual([]);
    expect(plan.url).toBe("https://acme.test.workers.dev");
    expect(plan.live).toMatchObject({ number: 2, id: "B", commit: commit.slice(0, 12) });
    expect(plan.liveReaches).toBeUndefined();
    expect(plan.unchanged).toBe(false);
  });

  it("names who holds the lock without taking it", async () => {
    const until = Date.UTC(2100, 0, 1);
    const { target, api } = setup({
      resources: existing,
      deployment: [{ id: "B", percentage: 100 }],
      lock: { id: "theirs", label: "kim@example.com", startedAt: 1_000, expiresAt: until },
    });
    expect((await target.plan(request)).lockedBy).toEqual({
      who: "kim@example.com",
      startedAt: new Date(1_000).toISOString(),
      expiresAt: new Date(until).toISOString(),
    });
    expect(api.calls.filter((call) => /DeployLock /.test(call))).toEqual([]);
  });

  it("fails when the lock can't be read, rather than say no one holds it", async () => {
    const { target } = setup({ resources: existing }, (api) => ({
      ...api,
      readDeployLock: async () => {
        throw new Error("D1 is down");
      },
    }));
    await expect(target.plan(request)).rejects.toMatchObject({ name: "DeployFailure" });
  });
});
