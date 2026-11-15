import { createHash } from "node:crypto";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { adminKeySecretName, withAdminKey } from "./admin-key.ts";
import { DeployError } from "./errors.ts";
import { fakeCloudflareApi } from "./fake-api.ts";
import { rollback } from "./rollback.ts";

const options = {
  accountId: "a1",
  worker: "hlt-w",
  label: "mateo on laptop",
  randomKey: () => new Uint8Array(32).fill(7),
  lock: { id: "mine" },
  sleep: async () => {},
};
const hash = createHash("sha256").update(Buffer.alloc(32, 7).toString("base64url")).digest("hex");
const key = Buffer.alloc(32, 7).toString("base64url");

verifies("deploy.admin-key", () => {
  it("sets the key's hash before the job and removes it after", async () => {
    const api = fakeCloudflareApi({ accounts: [] });
    const seen: string[][] = [];
    const value = await withAdminKey(api, options, async (given) => {
      seen.push(api.workerSecretNames());
      expect(given).toBe(key);
      return 42;
    });
    expect(value).toBe(42);
    expect(seen).toEqual([[adminKeySecretName]]);
    expect(api.workerSecretNames()).toEqual([]);
    expect(api.calls).toEqual([
      "takeDeployLock mine",
      `setWorkerSecret hlt-w ${adminKeySecretName}`,
      `deleteWorkerSecret hlt-w ${adminKeySecretName}`,
      "releaseDeployLock mine",
    ]);
  });

  it("makes a different key each time by default", async () => {
    const api = fakeCloudflareApi({ accounts: [] });
    const keys: string[] = [];
    for (let i = 0; i < 2; i++) {
      await withAdminKey(
        api,
        { accountId: "a1", worker: "hlt-w", label: "mateo on laptop", sleep: options.sleep },
        async (k) => {
          keys.push(k);
        },
      );
    }
    expect(keys[0]).not.toBe(keys[1]);
    expect(Buffer.from(keys[0] ?? "", "base64url")).toHaveLength(32);
  });

  it("removes the secret and throws the job's error when the job fails", async () => {
    const api = fakeCloudflareApi({ accounts: [] });
    await expect(
      withAdminKey(api, options, async () => {
        throw new Error("job broke");
      }),
    ).rejects.toThrow("job broke");
    expect(api.workerSecretNames()).toEqual([]);
  });

  it("tries to remove the secret when setting it failed part way", async () => {
    const api = fakeCloudflareApi({ accounts: [], secretSetFails: true });
    await expect(withAdminKey(api, options, async () => 1)).rejects.toThrow("Cloudflare is down");
    expect(api.calls).toContain(`deleteWorkerSecret hlt-w ${adminKeySecretName}`);
  });

  it("fails with admin-key-left when the secret stays, even after a good job", async () => {
    const api = fakeCloudflareApi({ accounts: [], secretDeleteFails: true });
    const error = (await withAdminKey(api, options, async () => 1).catch((e) => e)) as DeployError;
    expect(error.code).toBe("admin-key-left");
    expect(error.message).toContain(adminKeySecretName);
    expect(error.cause).toBeInstanceOf(Error);
  });

  it("keeps the job's error as the cause when both fail, and names neither the key nor its hash", async () => {
    const api = fakeCloudflareApi({ accounts: [], secretDeleteFails: true });
    const error = (await withAdminKey(api, options, async (k) => {
      throw new Error(`rejected ${k}`);
    }).catch((e) => e)) as DeployError;
    expect(error.code).toBe("admin-key-left");
    expect((error.cause as Error).message).toContain("rejected");
    expect(error.message).not.toContain(key);
    expect(error.message).not.toContain(hash);
  });

  it("leaves neither the key nor its hash in the message, stack or cause of any error", async () => {
    for (const secretDeleteFails of [false, true]) {
      const api = fakeCloudflareApi({ accounts: [], secretDeleteFails });
      const error = (await withAdminKey(api, options, async (k) => {
        throw new DeployError("smoke-test-failed", `rejected ${k}`, {
          cause: new Error(`inner ${hash}`),
        });
      }).catch((e) => e)) as DeployError;
      const texts: string[] = [];
      for (let e: unknown = error; e instanceof Error; e = e.cause) {
        texts.push(e.message, e.stack ?? "");
      }
      for (const text of texts) {
        expect(text).not.toContain(key);
        expect(text).not.toContain(hash);
      }
      expect(texts.join("\n")).toContain("rejected [redacted]");
      expect(texts.join("\n")).toContain("inner [redacted]");
      // The job's own class and code survive, or one that wraps it names it.
      if (!secretDeleteFails) expect(error.code).toBe("smoke-test-failed");
    }
  });

  it("tries to remove the secret again before it gives up", async () => {
    const api = fakeCloudflareApi({ accounts: [], secretDeleteFails: 2 });
    expect(await withAdminKey(api, options, async () => 1)).toBe(1);
    expect(api.workerSecretNames()).toEqual([]);
    const gone = fakeCloudflareApi({ accounts: [], secretDeleteFails: 3 });
    const error = (await withAdminKey(gone, options, async () => 1).catch((e) => e)) as DeployError;
    expect(error.code).toBe("admin-key-left");
    expect(gone.calls.filter((c) => c.startsWith("deleteWorkerSecret"))).toHaveLength(3);
  });

  it("holds the deploy lock around set, job and remove, and sets nothing when it is taken", async () => {
    const taken = fakeCloudflareApi({
      accounts: [],
      lock: { id: "other", label: "ana", startedAt: 1, expiresAt: Date.now() + 60_000 },
    });
    const error = (await withAdminKey(taken, options, async () => 1).catch(
      (e) => e,
    )) as DeployError;
    expect(error.code).toBe("deploy-locked");
    expect(taken.calls.some((c) => c.includes("WorkerSecret"))).toBe(false);
  });

  it("removes the secret and frees the lock on Ctrl C, even when the job ignores it", async () => {
    const api = fakeCloudflareApi({ accounts: [] });
    const controller = new AbortController();
    const error = (await withAdminKey(api, { ...options, signal: controller.signal }, async () => {
      controller.abort();
      return new Promise<number>(() => {});
    }).catch((e) => e)) as DeployError;
    expect(error.code).toBe("deploy-aborted");
    expect(api.workerSecretNames()).toEqual([]);
    expect(api.calls.at(-1)).toBe("releaseDeployLock mine");
  });

  it("sets nothing when Ctrl C came before the job started", async () => {
    const api = fakeCloudflareApi({ accounts: [] });
    const controller = new AbortController();
    controller.abort();
    const error = (await withAdminKey(
      api,
      { ...options, signal: controller.signal },
      async () => 1,
    ).catch((e) => e)) as DeployError;
    expect(error.code).toBe("deploy-aborted");
    expect(api.calls.some((c) => c.includes("WorkerSecret"))).toBe(false);
  });
});

verifies("deploy.rollback", () => {
  it("never rolls back to a deployment an admin key made, and rolls back from the code before it", async () => {
    const api = fakeCloudflareApi({
      accounts: [],
      resources: { "database hlt-w-data": { marked: true } },
      deployment: [{ id: "B", percentage: 100 }],
      earlier: [[{ id: "A", percentage: 100 }]],
    });
    await withAdminKey(api, options, async () => {});
    const result = await rollback(api, {
      accountId: "a1",
      worker: "hlt-w",
      label: "mateo on laptop",
      lock: { id: "rb" },
      fetch: (async () => new Response("{}", { status: 404 })) as typeof fetch,
    });
    expect(result.to).toEqual([{ id: "A", percentage: 100 }]);
    expect(api.calls).toContain("deployVersions A:100");
  });
});
