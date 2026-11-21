import { mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileSystemFolderReader, FolderDefinitionStore } from "@halonicjs/adapter-fs-node";
import { webCryptoDigest } from "@halonicjs/adapter-fs-tauri";
import { MemoryTrustStore } from "@halonicjs/adapter-memory";
import { TrustService } from "@halonicjs/app";
import type { TrustRecord } from "@halonicjs/ports";
import { fixedClock } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { trustedSourcesOf } from "./trusted-sources.ts";
import { WorkspaceTrust } from "./workspace-trust.ts";

/** A plugin sign-out that signs out nothing: these rows are workspaces, or only listed. */
const signOutPlugin = async () => undefined;

/** A trust record for the folder at `location`, a plugin's when its fingerprint starts with `hpf1:`. */
function record(location: string, fingerprint = "hfp1:a"): TrustRecord {
  return {
    location,
    fingerprint,
    content: {},
    grantedAt: "2026-11-03T12:00:00.000Z",
    appVersion: "0.1.0",
    pins: {},
    origin: "prompt",
  };
}

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
    const host = trustedSourcesOf({ store, signOutPlugin });
    expect(await host.list()).toEqual([
      {
        location: "/work/inbox-helper",
        name: "inbox-helper",
        trustedAt: "2026-11-03T12:00:00.000Z",
        kind: "workspace",
      },
    ]);
    await host.remove("/work/inbox-helper");
    expect(await host.list()).toEqual([]);
  });

  it("tells a plugin's record from a workspace's by its fingerprint", async () => {
    const store = new MemoryTrustStore();
    await store.grant({
      location: "/plugins/weather",
      fingerprint: "hpf1:a",
      content: {},
      grantedAt: "2026-11-03T12:00:00.000Z",
      appVersion: "0.1.0",
      pins: {},
      origin: "cli",
    });
    const rows = await trustedSourcesOf({ store, signOutPlugin }).list();
    expect(rows.map((row) => [row.name, row.kind])).toEqual([["weather", "plugin"]]);
  });

  it("marks a row whose folder is gone, and shows the list when the shell can't tell", async () => {
    const store = new MemoryTrustStore();
    for (const location of ["/work/here", "/work/gone"]) {
      await store.grant({
        location,
        fingerprint: "hfp1:a",
        content: {},
        grantedAt: "2026-11-03T12:00:00.000Z",
        appVersion: "0.1.0",
        pins: {},
        origin: "prompt",
      });
    }
    const asked: string[][] = [];
    const known = trustedSourcesOf({
      store,
      signOutPlugin,
      foldersFound: async (locations) => {
        asked.push([...locations]);
        return new Map([
          ["/work/here", true],
          ["/work/gone", false],
        ]);
      },
    });
    const rows = await known.list();
    expect(rows.map((row) => [row.name, row.found])).toEqual([
      ["gone", false],
      ["here", true],
    ]);
    expect(asked).toEqual([["/work/gone", "/work/here"]]);

    const unknown = trustedSourcesOf({
      store,
      signOutPlugin,
      foldersFound: async () => {
        throw new Error("no answer");
      },
    });
    expect((await unknown.list()).map((row) => row.found)).toEqual([undefined, undefined]);
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

      const host = trustedSourcesOf({ store, signOutPlugin, afterRemove: () => trust.refresh() });
      const [record] = await host.list();
      await host.remove(record?.location ?? "");

      expect(trust.isTrusted()).toBe(false);
    } finally {
      await rm(folder, { recursive: true, force: true });
    }
  });
});

verifies("app.plugin-sign-out", () => {
  it("signs a plugin out while its record is still there, then removes the record", async () => {
    const store = new MemoryTrustStore();
    await store.grant(record("/profile/plugins/weather", "hpf1:a"));
    const signedOut: { id: string; trusted: boolean }[] = [];
    const host = trustedSourcesOf({
      store,
      signOutPlugin: async (id) => {
        signedOut.push({ id, trusted: (await store.list()).length > 0 });
      },
    });

    await host.remove("/profile/plugins/weather");

    expect(signedOut).toEqual([{ id: "weather", trusted: true }]);
    expect(await host.list()).toEqual([]);
  });

  it("removes a plugin's record when its sign-out fails, and gives the error", async () => {
    const store = new MemoryTrustStore();
    await store.grant(record("/profile/plugins/weather", "hpf1:a"));
    let refreshed = false;
    const host = trustedSourcesOf({
      store,
      signOutPlugin: async () => {
        throw new Error("the agent host isn't running");
      },
      afterRemove: async () => {
        refreshed = true;
      },
    });

    await expect(host.remove("/profile/plugins/weather")).rejects.toThrow(
      "the agent host isn't running",
    );

    expect(await host.list()).toEqual([]);
    expect(refreshed).toBe(true);
  });

  it("signs out no plugin when a workspace's record is removed", async () => {
    const store = new MemoryTrustStore();
    await store.grant(record("/work/weather"));
    const signedOut: string[] = [];
    const host = trustedSourcesOf({ store, signOutPlugin: async (id) => void signedOut.push(id) });

    await host.remove("/work/weather");

    expect(signedOut).toEqual([]);
  });
});
