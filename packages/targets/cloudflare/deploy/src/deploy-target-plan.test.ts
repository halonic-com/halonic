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

/** A version's record as the deploy writes it (`deploy.record`). */
function record(fields: Record<string, unknown> = {}): string {
  return JSON.stringify({ commit, halonicVersion: "0.2.0", reaches: [], ...fields });
}

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
      adopts: [],
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

  it("is unchanged when the live version's record has the snapshot's commit and Halonic version", async () => {
    const reaches = [{ address: "api.anthropic.com", secret: "ANTHROPIC_API_KEY" }];
    const { target } = setup({
      resources: existing,
      applied: migrations.map((migration) => migration.id),
      deployment: [{ id: "B", percentage: 100 }],
      versionMessages: { B: versionNote({ commit, bundleHash: "f".repeat(64) }) },
      stored: { "acme-defs/deploys/B.json": record({ reaches }) },
    });
    const plan = await target.plan(request);
    expect(plan.live).toMatchObject({ id: "B", commit, halonicVersion: "0.2.0" });
    expect(plan.liveReaches).toEqual(reaches);
    expect(plan.unchanged).toBe(true);
  });

  it("lists what it would take over, not create, when the request sets adopt", async () => {
    const { target } = setup({
      resources: { ...existing, "bucket acme-blobs": { marked: false } },
      deployment: [{ id: "B", percentage: 100 }],
    });
    const plan = await target.plan({ ...request, adopt: true });
    expect(plan.adopts).toEqual([{ kind: "bucket", name: "acme-blobs" }]);
    expect(plan.creates).toEqual([]);
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

verifies("deploy.record", () => {
  const live = {
    resources: existing,
    applied: migrations.map((migration) => migration.id),
    deployment: [{ id: "B", percentage: 100 }],
    versionMessages: { B: versionNote({ commit, bundleHash: "f".repeat(64) }) },
  };

  it("gives the live version's Halonic version and full commit in status", async () => {
    const { target } = setup({ ...live, stored: { "acme-defs/deploys/B.json": record() } });
    expect((await target.status(web)).live).toMatchObject({
      id: "B",
      commit,
      halonicVersion: "0.2.0",
    });
  });

  it("counts a record that doesn't fit as none", async () => {
    for (const text of ["not json", record({ halonicVersion: 2 }), record({ reaches: [{}] })]) {
      const { target } = setup({ ...live, stored: { "acme-defs/deploys/B.json": text } });
      const plan = await target.plan(request);
      expect(plan.live?.halonicVersion).toBeUndefined();
      expect(plan.liveReaches).toBeUndefined();
      expect(plan.unchanged).toBe(false);
    }
  });

  it("fails status, plan and rollback when R2 refuses to read the record, rather than guess", async () => {
    const { target } = setup({ ...live }, (api) => ({
      ...api,
      getObject: async () => {
        throw new Error("R2 answered 403");
      },
    }));
    await expect(target.status(web)).rejects.toMatchObject({ name: "DeployFailure" });
    await expect(target.plan(request)).rejects.toMatchObject({ name: "DeployFailure" });
    await expect(target.rollback(web)).rejects.toMatchObject({ name: "DeployFailure" });
  });
});
