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
});
