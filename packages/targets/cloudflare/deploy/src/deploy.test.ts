import { createHash } from "node:crypto";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { type DeployOptions, type DeployProgress, deploy } from "./deploy.ts";
import type { DeployError } from "./errors.ts";
import { fakeCloudflareApi } from "./fake-api.ts";

const script = "export default {};";
const hash = createHash("sha256").update(script).digest("hex");
const passing = JSON.stringify({ ok: true, checks: [] });
const live = [{ id: "old", percentage: 100 }];
const ours = { marked: true };
const owned = {
  "database w-data": ours,
  "bucket w-blobs": ours,
  "worker w": ours,
};

function setup(
  state: Parameters<typeof fakeCloudflareApi>[0],
  changed = 0,
  extra: Partial<DeployOptions> = {},
) {
  const api = fakeCloudflareApi(state);
  const events: DeployProgress[] = [];
  const log: string[] = [];
  const options: DeployOptions = {
    accountId: "a1",
    worker: "w",
    environment: "production",
    source: {
      commit: async () => "c0ffee",
      changedFileCount: async () => changed,
    },
    validate: async () => {
      log.push("validate");
    },
    test: async () => {
      log.push("test");
    },
    prepare: async () => {
      log.push("prepare");
      return {
        bundle: { script, hash },
        bindings: [],
        secrets: { HALONIC_SECRET_SERVE_PASSWORD: "x" },
      };
    },
    migrations: [{ id: "0001", statements: ["CREATE TABLE a (x TEXT)"] }],
    compatibilityDate: "2026-07-30",
    label: "mateo on test",
    onProgress: (event) => events.push(event),
    upload: {
      sleep: async () => {},
      attempts: 1,
      fetch: (async () => new Response(passing)) as unknown as typeof fetch,
    },
    ...extra,
  };
  return { api, events, log, options };
}

verifies("deploy.orchestrate", () => {
  it("runs the steps in the ADR order and names the commit and version", async () => {
    const { api, events, log, options } = setup({
      accounts: [],
      resources: owned,
      deployment: live,
    });
    const done = await deploy(api, options);
    expect(done).toEqual({ mode: "deployed", commit: "c0ffee", versionId: "v1" });
    expect(log).toEqual(["validate", "test", "prepare"]);
    expect(events.map((e) => e.step)).toEqual([
      "validated",
      "tested",
      "snapshot",
      "provisioned",
      "migrated",
      "bundle-checked",
      "uploaded",
      "smoke-test",
      "switched",
    ]);
    const calls = api.calls;
    const at = (call: string) => calls.findIndex((c) => c.startsWith(call));
    expect(at("takeDeployLock")).toBeLessThan(at("applyMigration"));
    expect(at("applyMigration")).toBeLessThan(at("uploadVersion"));
    expect(calls.at(-1)).toMatch(/^releaseDeployLock/);
  });

  it("asks for secrets before it creates anything", async () => {
    const { api, options } = setup({ accounts: [] });
    const asked: string[] = [];
    await deploy(api, {
      ...options,
      prepare: async () => {
        asked.push(...api.calls.filter((c) => c.startsWith("create")));
        return { bundle: { script, hash }, bindings: [], secrets: {} };
      },
    });
    expect(asked).toEqual([]);
    expect(api.calls).toContain("createResource database w-data");
  });

  it("refuses a production deploy with uncommitted changes before anything is created", async () => {
    const { api, log, options } = setup({ accounts: [] }, 3);
    const error = (await deploy(api, options).catch((e: unknown) => e)) as DeployError;
    expect(error.code).toBe("uncommitted-changes");
    expect(error.message).toContain("3 changed files aren't committed");
    expect(log).not.toContain("prepare");
    expect(api.calls.filter((c) => c.startsWith("create"))).toEqual([]);
  });

  it("allows uncommitted changes in production only with allowDirty", async () => {
    const { api, events, options } = setup(
      { accounts: [], resources: owned, deployment: live },
      1,
      {
        allowDirty: true,
      },
    );
    await deploy(api, options);
    expect(events).toContainEqual({ step: "uncommitted-files", count: 1 });
  });

  it("reports the changed files of a development deploy and skips the tests", async () => {
    const { api, events, log, options } = setup(
      { accounts: [], resources: owned, deployment: live },
      2,
      { environment: "development" },
    );
    await deploy(api, options);
    expect(events).toContainEqual({ step: "uncommitted-files", count: 2 });
    expect(log).not.toContain("test");
  });

  it("plan changes nothing, takes no lock, runs no tests and asks for no secrets", async () => {
    const { api, log, options } = setup({ accounts: [], failOnWrite: true, noDatabase: true }, 1);
    const result = await deploy(api, { ...options, plan: true });
    expect(result.mode).toBe("plan");
    if (result.mode === "plan") {
      expect(result.migrations).toEqual(["0001"]);
      expect(result.resources.map((r) => r.action)).toEqual(["create", "create", "create"]);
    }
    expect(log).toEqual(["validate"]);
    expect(api.calls.some((c) => c.includes("DeployLock"))).toBe(false);
  });

  it("warns before a live migration on a Worker that has traffic", async () => {
    const { api, events, options } = setup({ accounts: [], resources: owned, deployment: live });
    await deploy(api, {
      ...options,
      durableObjectMigrations: [{ tag: "v2", new_sqlite_classes: ["Run"] }],
    });
    const steps = events.map((e) => e.step);
    expect(steps.indexOf("live-migration-ahead")).toBeLessThan(steps.indexOf("uploaded"));
  });

  it("does not warn on a first deploy", async () => {
    const { api, events, options } = setup({ accounts: [] });
    await deploy(api, {
      ...options,
      durableObjectMigrations: [{ tag: "v1", new_sqlite_classes: ["Run"] }],
    });
    expect(events.some((e) => e.step === "live-migration-ahead")).toBe(false);
  });

  it("frees the lock when the self-test fails", async () => {
    const { api, options } = setup({ accounts: [], resources: owned, deployment: live });
    const failing = JSON.stringify({ ok: false, checks: [{ name: "d1", ok: false }] });
    const error = (await deploy(api, {
      ...options,
      upload: { ...options.upload, fetch: (async () => new Response(failing)) as typeof fetch },
    }).catch((e: unknown) => e)) as DeployError;
    expect(error.code).toBe("smoke-test-failed");
    expect(api.calls.at(-1)).toMatch(/^releaseDeployLock/);
  });

  it("stops with deploy-aborted when interrupted and takes no lock", async () => {
    const controller = new AbortController();
    const { api, options } = setup({ accounts: [], resources: owned, deployment: live });
    const error = (await deploy(api, {
      ...options,
      signal: controller.signal,
      prepare: async () => {
        controller.abort();
        return { bundle: { script, hash }, bindings: [], secrets: {} };
      },
    }).catch((e: unknown) => e)) as DeployError;
    expect(error.code).toBe("deploy-aborted");
    expect(api.calls.some((c) => c.startsWith("takeDeployLock"))).toBe(false);
  });

  it("stops before traffic changes when the lock is lost by then", async () => {
    const clock = { t: 0 };
    const { api, options } = setup({
      accounts: [],
      resources: owned,
      deployment: live,
      now: () => clock.t,
    });
    const error = (await deploy(api, {
      ...options,
      upload: {
        ...options.upload,
        fetch: (async () => {
          clock.t += 11 * 60_000;
          await api.takeDeployLock("a1", "w-data", { id: "other", label: "ana", leaseMs: 60_000 });
          return new Response(passing);
        }) as unknown as typeof fetch,
      },
    }).catch((e: unknown) => e)) as DeployError;
    expect(error.code).toBe("deploy-lock-lost");
    expect(api.calls.some((c) => c.includes("v1:100"))).toBe(false);
  });

  it("reports a live deploy with a warning when the lock is lost after the switch", async () => {
    let takenOver = false;
    const { api, options } = setup({ accounts: [], resources: owned, deployment: live });
    const renewDeployLock = api.renewDeployLock.bind(api);
    const done = await deploy(
      { ...api, renewDeployLock: async (...args) => (takenOver ? undefined : renewDeployLock(...args)) },
      {
        ...options,
        onProgress: (event) => {
          if (event.step === "switched") takenOver = true;
        },
      },
    );
    expect(done).toMatchObject({ mode: "deployed", versionId: "v1" });
    const warning = (done as { warnings?: string[] }).warnings?.[0];
    expect(warning).toMatch(/^The deploy is live, but its lock was lost after traffic switched/);
    expect(warning).not.toMatch(/stopped/);
  });
});
