import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { migrations } from "@halonicjs/adapter-cloudflare-storage";
import type { DeployEvent, DeployFailure, DeploymentRef, DeployRequest } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import type { WorkerScript } from "./deploy-target-deploy.ts";
import {
  type CloudflareDeployTargetOptions,
  createCloudflareDeployTarget,
} from "./deploy-target-entry.ts";
import { type FakeCloudflareState, fakeCloudflareApi } from "./fake-api.ts";
import { shippedWorker } from "./shipped-worker.ts";
import { FilesSource } from "./write-workspace-snapshot.ts";

const web: DeploymentRef = {
  name: "web",
  accountId: "a1",
  service: "acme",
  environment: "production",
};
const commit = "0123456789abcdef0123456789abcdef01234567";
const script = "export default {};";
const worker: WorkerScript = {
  script,
  hash: createHash("sha256").update(script).digest("hex"),
  compatibilityDate: "2026-07-30",
  durableObjects: [{ name: "RUN", class_name: "RunObject" }],
  durableObjectMigrations: [{ tag: "v1", new_sqlite_classes: ["RunObject"] }],
};
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
    files: new FilesSource({ "halonic.yaml": "name: acme\n" }),
    halonicVersion: "0.2.0",
  },
  secrets: new Map([["anthropic-key", "not-shown"]]),
  reaches: [],
};
const passing = JSON.stringify({ ok: true, checks: [] });
const failing = JSON.stringify({ ok: false, checks: [{ name: "d1", ok: false }] });

function setup(
  state: Partial<FakeCloudflareState>,
  answer = passing,
  options: CloudflareDeployTargetOptions = { worker: async () => worker },
) {
  const api = fakeCloudflareApi({ accounts: [{ id: "a1", name: "Acme" }], ...state });
  const target = createCloudflareDeployTarget(
    {
      http: { fetch: async () => new Response(answer) },
      tokens: { get: async () => "saved-token", set: async () => {}, remove: async () => {} },
      environmentToken: undefined,
      who: "sam@example.com",
    },
    { api: () => api, upload: { sleep: async () => {}, attempts: 1 }, ...options },
  );
  const events: DeployEvent[] = [];
  return { api, target, events, show: (event: DeployEvent) => events.push(event) };
}

const steps = (events: readonly DeployEvent[]) =>
  events.map((e) => `${e.phase} ${"step" in e ? e.step : ""}`.trim());

verifies("deploy.target-deploy", () => {
  it("deploys a first version: creates everything, goes live with the upload, then self-tests", async () => {
    const { api, target, events, show } = setup({});
    const result = await target.deploy(request, show);
    expect(result).toEqual({
      outcome: "deployed",
      url: "https://acme.test.workers.dev",
      version: { number: 1, id: "v1", commit, halonicVersion: "0.2.0", liveSince: undefined },
      previous: undefined,
      warnings: [],
    });
    expect(steps(events)).toEqual([
      ...Array(4).fill(["started create", "done create"]).flat(),
      "started database",
      "done database",
      "started upload",
      "done upload",
      "started switch",
      "done switch",
      "started self-test",
      "done self-test",
    ]);
    expect(events).toContainEqual({
      phase: "done",
      step: "database",
      changes: expect.any(Number),
      first: true,
    });
    expect(events).toContainEqual({
      phase: "started",
      step: "upload",
      version: 1,
      files: 1,
      secrets: 1,
    });
    expect(api.calls).toContain("uploadWorkerLive acme v1");
    expect(api.calls).toContain("secrets HALONIC_SECRET_ANTHROPIC_KEY,HALONIC_SELFTEST_TOKEN");
    expect(api.bindings[0]).toEqual(
      expect.arrayContaining([
        { type: "durable_object_namespace", name: "RUN", class_name: "RunObject" },
        { type: "d1", name: "DB", id: "id-acme-data" },
        { type: "r2_bucket", name: "BLOBS", bucket_name: "acme-blobs" },
        { type: "plain_text", name: "HALONIC_ALLOWED_HOSTS", text: "acme.test.workers.dev" },
        { type: "plain_text", name: "HALONIC_DEPLOYMENT_ID", text: "web" },
      ]),
    );
    expect(JSON.stringify([api.bindings, api.messages, events, result])).not.toContain("not-shown");
  });

  it("tries a new version dark before it switches, numbered after the live one", async () => {
    const { api, target, events, show } = setup({
      resources: existing,
      applied: migrations.map((migration) => migration.id),
      deployment: [{ id: "b", percentage: 100 }],
      earlier: [[{ id: "a", percentage: 100 }]],
    });
    const result = await target.deploy(request, show);
    expect(result).toMatchObject({
      outcome: "deployed",
      version: { number: 3, id: "v1" },
      previous: { number: 2, id: "b" },
    });
    expect(steps(events)).toEqual([
      "started upload",
      "done upload",
      "started self-test",
      "done self-test",
      "started switch",
      "done switch",
    ]);
    expect(api.calls).toContain("uploadVersion acme");
    expect(api.calls.some((call) => call.startsWith("uploadWorkerLive"))).toBe(false);
  });

  it("gives a failed self-test as a result, with the version that still serves", async () => {
    const { target, show } = setup(
      { resources: existing, deployment: [{ id: "b", percentage: 100 }] },
      failing,
    );
    const result = await target.deploy(request, show);
    expect(result).toMatchObject({
      outcome: "self-test-failed",
      version: { number: 2, id: "v1" },
      failedChecks: ["d1"],
      stillLive: { number: 1, id: "b" },
      restoreFailed: false,
    });
  });

  it("stops with what still serves and the step it stopped after", async () => {
    const stop = new AbortController();
    const { target, events } = setup({});
    const error = (await target
      .deploy({ ...request, signal: stop.signal }, (event) => {
        events.push(event);
        if (event.phase === "done" && event.step === "create") stop.abort();
      })
      .catch((e: unknown) => e)) as DeployFailure;
    expect(error).toMatchObject({ code: "stopped", kind: "conflict", live: "none" });
    expect(error.stoppedAfter).toEqual({
      step: "create",
      resource: { kind: "service", name: "acme" },
    });
  });

  it("says what still serves when the lock is lost after the snapshot was written", async () => {
    const { api, target, show } = setup({
      resources: existing,
      applied: migrations.map((migration) => migration.id),
      deployment: [{ id: "b", percentage: 100 }],
    });
    // Another deploy takes the lock over once this one has written the snapshot.
    const { putObject, renewDeployLock } = api;
    let snapshotWritten = false;
    api.putObject = async (...args) => {
      await putObject(...args);
      snapshotWritten = true;
    };
    api.renewDeployLock = async (...args) =>
      snapshotWritten ? undefined : renewDeployLock(...args);
    const error = (await target.deploy(request, show).catch((e: unknown) => e)) as DeployFailure;
    expect(error).toMatchObject({
      code: "deploy-locked",
      kind: "conflict",
      live: { number: 1, id: "b" },
    });
    expect(Object.keys(api.written).length).toBeGreaterThan(0);
    expect(api.calls.some((call) => call.startsWith("upload"))).toBe(false);
  });

  it("rejects with unexpected, before any Cloudflare call, while there's no Worker to upload", async () => {
    const empty = await mkdtemp(join(tmpdir(), "halonic-no-worker-"));
    try {
      const { api, target, show } = setup({ resources: existing }, passing, {
        worker: shippedWorker(pathToFileURL(`${empty}/`)),
      });
      await expect(target.deploy(request, show)).rejects.toMatchObject({ code: "unexpected" });
      expect(api.calls).toEqual([]);
    } finally {
      await rm(empty, { recursive: true, force: true });
    }
  });
});

verifies("deploy.record", () => {
  const reaching: DeployRequest = {
    ...request,
    reaches: [
      { address: "api.anthropic.com", secret: "anthropic-key" },
      { address: "*", secret: undefined },
    ],
  };

  it("keeps the version's commit, Halonic version and reaches once it serves", async () => {
    const { api, target, show } = setup({});
    await target.deploy(reaching, show);
    expect(JSON.parse(api.written["acme-defs/deploys/v1.json"] ?? "")).toEqual({
      commit,
      halonicVersion: "0.2.0",
      reaches: [
        { address: "api.anthropic.com", secret: "anthropic-key" },
        { address: "*", secret: null },
      ],
    });
  });

  it("still ends as deployed when the record can't be written", async () => {
    const api = fakeCloudflareApi({ accounts: [{ id: "a1", name: "Acme" }] });
    const target = createCloudflareDeployTarget(
      {
        http: { fetch: async () => new Response(passing) },
        tokens: { get: async () => "saved-token", set: async () => {}, remove: async () => {} },
        environmentToken: undefined,
        who: "sam@example.com",
      },
      {
        api: () => ({
          ...api,
          putObject: async (accountId, bucket, key, value) => {
            if (key.startsWith("deploys/")) throw new Error("R2 is down");
            await api.putObject(accountId, bucket, key, value);
          },
        }),
        worker: async () => worker,
        upload: { sleep: async () => {}, attempts: 1 },
      },
    );
    await expect(target.deploy(reaching, () => {})).resolves.toMatchObject({
      outcome: "deployed",
    });
    expect(api.written["acme-defs/deploys/v1.json"]).toBeUndefined();
  });
});
