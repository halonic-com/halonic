import { createHash } from "node:crypto";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { type DeployError, SmokeTestFailedError } from "./errors.ts";
import { fakeCloudflareApi } from "./fake-api.ts";
import { type UploadProgress, uploadAndSwitch } from "./upload.ts";

const script = "export default {};";
const hash = createHash("sha256").update(script).digest("hex");
// Built while the test runs, so no secret-shaped text sits in this file.
const token = ["t", "0".repeat(63)].join("");
const secret = ["serve", "password", "value"].join("-");

function setup(state: Parameters<typeof fakeCloudflareApi>[0], answer: unknown, status = 200) {
  const api = fakeCloudflareApi(state);
  const requests: { url: string; headers: Record<string, string> }[] = [];
  const events: UploadProgress[] = [];
  const options = {
    accountId: "a1",
    worker: "w",
    bundle: { script, hash },
    compatibilityDate: "2026-07-30",
    bindings: [],
    secrets: { HALONIC_SECRET_SERVE_PASSWORD: secret },
    randomToken: () => token,
    sleep: async () => {},
    attempts: 2,
    onProgress: (event: UploadProgress) => events.push(event),
    fetch: (async (url: string, init?: RequestInit) => {
      requests.push({ url, headers: init?.headers as Record<string, string> });
      return new Response(JSON.stringify(answer), { status });
    }) as unknown as typeof fetch,
  };
  return { api, options, requests, events };
}

const passing = { ok: true, checks: [{ name: "database", ok: true }] };
const failing = { ok: false, checks: [{ name: "sign-in", ok: false }] };
const live = [{ id: "old", percentage: 100 }];

verifies("deploy.upload", () => {
  it("tries the new version at 0%, then switches all traffic", async () => {
    const { api, options, requests, events } = setup({ accounts: [], deployment: live }, passing);
    const done = await uploadAndSwitch(api, options);
    expect(done.versionId).toBe("v1");
    expect(api.calls).toContain("deployVersions old:100,v1:0");
    expect(api.calls.at(-1)).toBe("deployVersions v1:100");
    expect(requests[0]?.url).toBe("https://w.test.workers.dev/self-test");
    expect(requests[0]?.headers["Cloudflare-Workers-Version-Overrides"]).toBe('w="v1"');
    expect(events.map((e) => e.step)).toEqual([
      "bundle-checked",
      "uploaded",
      "smoke-test",
      "switched",
    ]);
  });

  it("keeps the previous version when the self-test fails", async () => {
    const { api, options, events } = setup({ accounts: [], deployment: live }, failing);
    const error = await uploadAndSwitch(api, options).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SmokeTestFailedError);
    expect((error as SmokeTestFailedError).failedChecks).toEqual(["sign-in"]);
    expect((error as SmokeTestFailedError).liveBefore).toBe(true);
    expect(api.calls.at(-1)).toBe("deployVersions old:100");
    expect(api.calls).not.toContain("deployVersions v1:100");
    expect(events.at(-1)?.step).toBe("kept-previous");
  });

  it("puts workers.dev back off after a passing or failing self-test", async () => {
    for (const answer of [passing, failing]) {
      const { api, options } = setup(
        { accounts: [], deployment: live, workersDevOn: false },
        answer,
      );
      await uploadAndSwitch(api, options).catch(() => {});
      expect(api.calls).toContain("openWorkersDev w");
      expect(api.calls).toContain("closeWorkersDev w");
      expect(await api.workersDevEnabled("a1", "w")).toBe(false);
    }
  });

  it("leaves workers.dev on when it was on before", async () => {
    const { api, options } = setup({ accounts: [], deployment: live }, passing);
    await uploadAndSwitch(api, options);
    expect(api.calls.some((c) => c.startsWith("closeWorkersDev"))).toBe(false);
  });

  it("stops before the switch and says workers.dev is on when it can't be closed after a pass", async () => {
    const { api, options, events } = setup(
      { accounts: [], deployment: live, workersDevOn: false, closeFails: true },
      passing,
    );
    await expect(uploadAndSwitch(api, options)).rejects.toThrow(
      "the previous version is still live and workers.dev is still on",
    );
    expect(api.calls).not.toContain("deployVersions v1:100");
    expect(events.some((e) => e.step === "workers-dev-left-open")).toBe(true);
  });

  it("says the new version is deployed when the close fails on a live deploy", async () => {
    const { api, options } = setup(
      { accounts: [], deployment: live, workersDevOn: false, closeFails: true },
      passing,
    );
    await expect(
      uploadAndSwitch(api, {
        ...options,
        durableObjectMigrations: [{ tag: "v2", new_sqlite_classes: ["B"] }],
      }),
    ).rejects.toThrow("The new version is deployed and passed its self-test");
  });

  it("leaves workers.dev on for a first deploy that reads it off", async () => {
    const { api, options } = setup({ accounts: [], workersDevOn: false }, passing);
    await uploadAndSwitch(api, options);
    expect(api.calls.some((c) => c.startsWith("closeWorkersDev"))).toBe(false);
    expect(await api.workersDevEnabled("a1", "w")).toBe(true);
  });

  it("reports workers.dev left open after a failing self-test", async () => {
    const { api, options, events } = setup(
      { accounts: [], deployment: live, workersDevOn: false, closeFails: true },
      failing,
    );
    await expect(uploadAndSwitch(api, options)).rejects.toBeInstanceOf(SmokeTestFailedError);
    expect(events.some((e) => e.step === "workers-dev-left-open")).toBe(true);
  });

  it("does not retry a report that says a check failed", async () => {
    const { api, options, requests } = setup({ accounts: [], deployment: live }, failing);
    await uploadAndSwitch(api, options).catch(() => {});
    expect(requests).toHaveLength(1);
  });

  it("retries while the address isn't answering yet", async () => {
    const { api, options, requests } = setup({ accounts: [], deployment: live }, {}, 404);
    const error = await uploadAndSwitch(api, options).catch((e: unknown) => e);
    expect(requests).toHaveLength(2);
    expect((error as SmokeTestFailedError).failedChecks).toEqual(["HTTP 404"]);
    expect(api.calls.at(-1)).toBe("deployVersions old:100");
  });

  it("uploads a never-deployed Worker live and tests it", async () => {
    const { api, options, requests } = setup({ accounts: [] }, passing);
    await uploadAndSwitch(api, {
      ...options,
      durableObjectMigrations: [{ tag: "v1", new_sqlite_classes: ["A"] }],
    });
    expect(api.calls).toContain("uploadWorkerLive w v1");
    expect(requests[0]?.headers["Cloudflare-Workers-Version-Overrides"]).toBeUndefined();
  });

  it("says the new version is live when a live upload fails its test", async () => {
    const { api, options } = setup({ accounts: [] }, failing);
    const error = await uploadAndSwitch(api, options).catch((e: unknown) => e);
    expect((error as SmokeTestFailedError).liveBefore).toBe(false);
  });

  it("uploads nothing when the script doesn't match its hash", async () => {
    const { api, options } = setup({ accounts: [], deployment: live }, passing);
    const error = await uploadAndSwitch(api, {
      ...options,
      bundle: { script: `${script} `, hash },
    }).catch((e: unknown) => e);
    expect((error as DeployError).code).toBe("bundle-hash-mismatch");
    expect(api.calls).toEqual([]);
  });

  it("sends the secrets and the self-test token in the upload", async () => {
    const { api, options } = setup({ accounts: [], deployment: live }, passing);
    await uploadAndSwitch(api, options);
    expect(api.calls).toContain("secrets HALONIC_SECRET_SERVE_PASSWORD,HALONIC_SELFTEST_TOKEN");
  });

  it("never puts the token or a secret in an event or an error", async () => {
    const { api, options, events } = setup({ accounts: [], deployment: live }, failing);
    const error = await uploadAndSwitch(api, options).catch((e: unknown) => e);
    const everything = JSON.stringify(events) + String((error as Error).message);
    expect(everything).not.toContain(token);
    expect(everything).not.toContain(secret);
  });

  it("makes a fresh 32-byte token by default", async () => {
    const { api, options, requests } = setup({ accounts: [], deployment: live }, passing);
    const { randomToken: _unused, ...rest } = options;
    await uploadAndSwitch(api, rest);
    const bearer = requests[0]?.headers["authorization"] ?? "";
    expect(bearer).toMatch(/^Bearer [0-9a-f]{64}$/);
  });

  it("drops a leftover 0% version so a deployment never holds three", async () => {
    const { api, options } = setup(
      {
        accounts: [],
        deployment: [
          { id: "old", percentage: 100 },
          { id: "left", percentage: 0 },
        ],
      },
      passing,
    );
    await uploadAndSwitch(api, options);
    expect(api.calls).toContain("deployVersions old:100,v1:0");
  });

  it("stops before uploading while two versions share traffic", async () => {
    const { api, options } = setup(
      {
        accounts: [],
        deployment: [
          { id: "a", percentage: 60 },
          { id: "b", percentage: 40 },
        ],
      },
      passing,
    );
    const error = await uploadAndSwitch(api, options).catch((e: unknown) => e);
    expect((error as DeployError).code).toBe("traffic-split-in-progress");
    expect(api.calls).toEqual(["currentDeployment"]);
  });

  it("names a migration as the reason a live deploy failed its test", async () => {
    const { api, options } = setup({ accounts: [], deployment: live }, failing);
    const error = await uploadAndSwitch(api, {
      ...options,
      durableObjectMigrations: [{ tag: "v2", new_sqlite_classes: ["B"] }],
    }).catch((e: unknown) => e);
    expect((error as SmokeTestFailedError).liveReason).toBe("migration");
    expect((error as Error).message).toContain("Durable Object migration");
    expect((error as Error).message).not.toContain("no previous version");
  });

  it("names a first deploy as the reason, in words", async () => {
    const { api, options } = setup({ accounts: [] }, failing);
    const error = await uploadAndSwitch(api, options).catch((e: unknown) => e);
    expect((error as SmokeTestFailedError).liveReason).toBe("first-deploy");
    expect((error as Error).message).toContain("no previous version");
  });

  it("fails clearly when the upload leaves no deployment to read back", async () => {
    const { api, options } = setup({ accounts: [] }, passing);
    const emptied = Object.assign(Object.create(api), {
      currentDeployment: async () => undefined,
    });
    const error = await uploadAndSwitch(emptied, options).catch((e: unknown) => e);
    expect((error as DeployError).code).toBe("cloudflare-request-failed");
  });

  it("still reports the failed self-test when putting the old version back fails", async () => {
    const { api, options } = setup({ accounts: [], deployment: live }, failing);
    let deploys = 0;
    const flaky = {
      ...api,
      deployVersions: async (...args: Parameters<typeof api.deployVersions>) => {
        deploys += 1;
        if (deploys === 2) throw new Error("Cloudflare is down");
        return api.deployVersions(...args);
      },
    };
    const error = await uploadAndSwitch(flaky, options).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SmokeTestFailedError);
    expect((error as SmokeTestFailedError).failedChecks).toEqual(["sign-in"]);
    expect((error as SmokeTestFailedError).restoreFailed).toBe(true);
    expect((error as Error).message).toContain("also failed");
  });

  it("redacts and bounds the check names a Worker reports", async () => {
    const checks = Array.from({ length: 12 }, (_, n) => ({
      name: `check-${n}-${secret}`,
      ok: false,
    }));
    const { api, options } = setup({ accounts: [], deployment: live }, { ok: false, checks });
    const error = await uploadAndSwitch(api, options).catch((e: unknown) => e);
    const named = (error as SmokeTestFailedError).failedChecks;
    expect(named).toHaveLength(11);
    expect(named.at(-1)).toBe("2 more");
    expect((error as Error).message).not.toContain(secret);
  });

  it("refuses a binding or secret named like the self-test token", async () => {
    const { api, options } = setup({ accounts: [], deployment: live }, passing);
    const error = await uploadAndSwitch(api, {
      ...options,
      secrets: { HALONIC_SELFTEST_TOKEN: "x" },
    }).catch((e: unknown) => e);
    expect((error as DeployError).code).toBe("reserved-binding-name");
    expect(api.calls).toEqual([]);
  });
});
