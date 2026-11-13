import { mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileSystemFolderReader, FolderDefinitionStore } from "@halonicjs/adapter-fs-node";
import { webCryptoDigest } from "@halonicjs/adapter-fs-tauri";
import { MemoryTrustStore } from "@halonicjs/adapter-memory";
import { TrustService } from "@halonicjs/app";
import { fixedClock } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { trustedSourcesOf } from "./trusted-sources.ts";
import { WorkspaceTrust } from "./workspace-trust.ts";

verifies("workspace.trusted-sources", () => {
  it("lists the profile's records by folder name and removes one", async () => {
    const store = new MemoryTrustStore();
    await store.grant({
      location: "/work/inbox-helper",
      fingerprint: "hfp1:a",
      content: {},
      grantedAt: "2026-11-03T12:00:00.000Z",
      appVersion: "0.1.0",
      pins: {},
      origin: "prompt",
    });
    const host = trustedSourcesOf(store);
    expect(await host.list()).toEqual([
      {
        location: "/work/inbox-helper",
        name: "inbox-helper",
        trustedAt: "2026-11-03T12:00:00.000Z",
      },
    ]);
    await host.remove("/work/inbox-helper");
    expect(await host.list()).toEqual([]);
  });

  it("takes the trust from a folder that is open when its record is removed, without a save", async () => {
    const folder = await realpath(await mkdtemp(join(tmpdir(), "halonic-sources-")));
    try {
      await writeFile(join(folder, "workspace.yaml"), "id: acme\nname: Acme\n");
      const store = new MemoryTrustStore();
      const trust = new WorkspaceTrust({
        definitions: new FolderDefinitionStore(folder, folder),
        folder: new FileSystemFolderReader(folder, folder),
        findCommand: async () => undefined,
        digest: webCryptoDigest,
        trust: new TrustService({
          store,
          digest: webCryptoDigest,
          clock: fixedClock(),
          appVersion: "0.1.0",
        }),
      });
      await trust.refresh();
      const shown = trust.check;
      if (shown === undefined || shown.status === "refused") throw new Error("expected a check");
      expect((await trust.grant(shown.fingerprint)).ok).toBe(true);
      expect(trust.isTrusted()).toBe(true);

      const host = trustedSourcesOf(store, () => trust.refresh());
      const [record] = await host.list();
      await host.remove(record?.location ?? "");

      expect(trust.isTrusted()).toBe(false);
    } finally {
      await rm(folder, { recursive: true, force: true });
    }
  });
});
