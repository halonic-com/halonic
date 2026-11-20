import { createHash } from "node:crypto";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import type { WorkerBinding } from "./api.ts";
import { type DeployOptions, type DeployProgress, deploy } from "./deploy.ts";
import { SmokeTestFailedError } from "./errors.ts";
import { fakeCloudflareApi } from "./fake-api.ts";

const script = "export default {};";
const hash = createHash("sha256").update(script).digest("hex");
const notePath = "hubs/acme/notes.md";
const passing = { ok: true, checks: [] };
const failing = { ok: false, checks: [{ name: "sign-in", ok: false }] };

/** A deploy of Worker `w` from `commit`, whose workspace holds one note, and a self-test that answers `selfTest`. */
function deployOptions(
  commit: string,
  note: string,
  selfTest: object,
  versions: string[],
  bindings: readonly WorkerBinding[] = [],
): DeployOptions {
  return {
    accountId: "a1",
    worker: "w",
    environment: "production",
    source: {
      commit: async () => commit,
      changedFileCount: async () => 0,
      files: async () => ({ [notePath]: note }),
    },
    validate: async () => {},
    test: async () => {},
    prepare: async () => ({ bundle: { script, hash }, bindings, secrets: {} }),
    migrations: [],
    compatibilityDate: "2026-07-30",
    label: "mateo on test",
    onProgress: (event: DeployProgress) => {
      if (event.step === "definitions-written") versions.push(event.version);
    },
    upload: {
      sleep: async () => {},
      attempts: 1,
      fetch: (async () => new Response(JSON.stringify(selfTest))) as unknown as typeof fetch,
    },
  };
}

function pinnedVersion(bindings: readonly WorkerBinding[] | undefined): unknown[] {
  return (bindings ?? [])
    .filter((binding) => binding.name === "HALONIC_DEFINITIONS_VERSION")
    .map((binding) => ({ type: binding.type, text: binding["text"] }));
}

verifies("deploy.definitions-pinned", () => {
  it("leaves the live version on its own snapshot when the next deploy's self-test fails", async () => {
    const api = fakeCloudflareApi({ accounts: [], deployment: [{ id: "old", percentage: 100 }] });
    const versions: string[] = [];

    const first = await deploy(api, deployOptions("a".repeat(40), "A", passing, versions));
    const failed = await deploy(api, deployOptions("b".repeat(40), "B", failing, versions)).catch(
      (error: unknown) => error,
    );

    expect(failed).toBeInstanceOf(SmokeTestFailedError);
    const [snapshotA, snapshotB] = versions;
    expect(snapshotA).not.toBe(snapshotB);
    expect(first.mode === "deployed" && first.versionId).toBe("v1");
    expect(await api.currentDeployment("a1", "w")).toEqual([{ id: "v1", percentage: 100 }]);
    // Upload 1 is the live version: it reads snapshot A, which the failed deploy left in place.
    expect(pinnedVersion(api.bindings[0])).toEqual([{ type: "plain_text", text: snapshotA }]);
    expect(pinnedVersion(api.bindings[1])).toEqual([{ type: "plain_text", text: snapshotB }]);
    expect(api.written[`w-defs/definitions/${snapshotA}/files/${notePath}`]).toBe("A");
  });

  it("replaces a caller's binding of the same name", async () => {
    const api = fakeCloudflareApi({ accounts: [], deployment: [{ id: "old", percentage: 100 }] });
    const versions: string[] = [];
    const own = [{ type: "plain_text", name: "HALONIC_DEFINITIONS_VERSION", text: "sha256:mine" }];
    await deploy(api, deployOptions("a".repeat(40), "A", passing, versions, own));
    expect(pinnedVersion(api.bindings.at(-1))).toEqual([{ type: "plain_text", text: versions[0] }]);
  });
});
