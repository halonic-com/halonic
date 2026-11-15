import { createHash } from "node:crypto";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { adminKeySecretName, withAdminKey } from "./admin-key.ts";
import type { DeployError } from "./errors.ts";
import { fakeCloudflareApi } from "./fake-api.ts";

const options = { accountId: "a1", worker: "hlt-w", randomKey: () => new Uint8Array(32).fill(7) };
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
      `setWorkerSecret hlt-w ${adminKeySecretName}`,
      `deleteWorkerSecret hlt-w ${adminKeySecretName}`,
    ]);
  });

  it("makes a different key each time by default", async () => {
    const api = fakeCloudflareApi({ accounts: [] });
    const keys: string[] = [];
    for (let i = 0; i < 2; i++) {
      await withAdminKey(api, { accountId: "a1", worker: "hlt-w" }, async (k) => {
        keys.push(k);
      });
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
    const hash = createHash("sha256").update(key).digest("hex");
    const error = (await withAdminKey(api, options, async (k) => {
      throw new Error(`rejected ${k}`);
    }).catch((e) => e)) as DeployError;
    expect(error.code).toBe("admin-key-left");
    expect((error.cause as Error).message).toContain("rejected");
    expect(error.message).not.toContain(key);
    expect(error.message).not.toContain(hash);
  });
});
