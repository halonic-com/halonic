import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { DeployRequest } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createCloudflareDeployTarget } from "./deploy-target-entry.ts";
import { fakeCloudflareApi } from "./fake-api.ts";
import { shippedWorker } from "./shipped-worker.ts";
import { FilesSource } from "./write-workspace-snapshot.ts";

const script = "export default {};\n";
const manifest = {
  hash: createHash("sha256").update(script).digest("hex"),
  compatibilityDate: "2026-07-30",
  durableObjects: [{ name: "RUN", class_name: "RunObject" }],
  durableObjectMigrations: [{ tag: "v1", new_sqlite_classes: ["RunObject"] }],
};

let directory: string;
let folder: URL;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "halonic-shipped-"));
  folder = pathToFileURL(`${directory}/`);
});
afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

async function ship(files: { script?: string; manifest?: unknown }): Promise<void> {
  if (files.script !== undefined)
    await writeFile(join(directory, "halonic-worker.js"), files.script);
  if (files.manifest !== undefined) {
    await writeFile(join(directory, "halonic-worker.json"), JSON.stringify(files.manifest));
  }
}

const request: DeployRequest = {
  deployment: { name: "web", accountId: "a1", service: "acme", environment: "production" },
  snapshot: {
    commit: "0123456789abcdef0123456789abcdef01234567",
    files: new FilesSource({ "halonic.yaml": "name: acme\n" }),
    halonicVersion: "0.2.0",
  },
  secrets: new Map(),
  reaches: [],
};

verifies("deploy.shipped-worker", () => {
  describe("shippedWorker", () => {
    it("loads the script with the manifest's hash, date and Durable Objects", async () => {
      await ship({ script, manifest });
      expect(await shippedWorker(folder)()).toEqual({ script, ...manifest });
    });

    it("passes on the manifest's hash, not the script's", async () => {
      await ship({ script: "export default { changed: true };\n", manifest });
      expect((await shippedWorker(folder)()).hash).toBe(manifest.hash);
    });

    it("rejects with unexpected and says how to build it in a clone when the files are missing", async () => {
      await ship({ manifest });
      await expect(shippedWorker(folder)()).rejects.toMatchObject({
        name: "DeployFailure",
        code: "unexpected",
        message: "This Halonic has no Cloudflare Worker to upload yet.",
        fix: "In a clone of halonic, run pnpm --filter @halonicjs/tooling-publish run build-worker first.",
      });
    });

    it("refuses a manifest without a hash or Durable Objects", async () => {
      await ship({ script, manifest: { ...manifest, hash: "abc" } });
      await expect(shippedWorker(folder)()).rejects.toThrow(/isn't a Worker manifest/);
      await ship({ script, manifest: { ...manifest, durableObjects: [] } });
      await expect(shippedWorker(folder)()).rejects.toThrow(/isn't a Worker manifest/);
    });
  });

  it("never uploads a shipped script that doesn't match its hash", async () => {
    await ship({ script: "export default { changed: true };\n", manifest });
    const api = fakeCloudflareApi({ accounts: [{ id: "a1", name: "Acme" }] });
    const target = createCloudflareDeployTarget(
      {
        http: { fetch: async () => new Response(JSON.stringify({ ok: true, checks: [] })) },
        tokens: { get: async () => "saved-token", set: async () => {}, remove: async () => {} },
        environmentToken: undefined,
        who: "sam@example.com",
      },
      {
        api: () => api,
        worker: shippedWorker(folder),
        upload: { sleep: async () => {}, attempts: 1 },
      },
    );
    await expect(target.deploy(request, () => {})).rejects.toMatchObject({
      name: "DeployFailure",
      message: expect.stringContaining("doesn't match the hash"),
    });
    expect(api.calls.filter((call) => call.startsWith("uploadWorker"))).toEqual([]);
  });
});
