import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileSystemFolderReader, FolderDefinitionStore } from "@halonicjs/adapter-fs-node";
import { webCryptoDigest } from "@halonicjs/adapter-fs-tauri";
import { MemoryTrustStore } from "@halonicjs/adapter-memory";
import { TrustService } from "@halonicjs/app";
import { fixedClock } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it } from "vitest";
import { WorkspaceTrust, type WorkspaceTrustSources } from "./workspace-trust.ts";
import { WorkspaceTrustView } from "./workspace-trust-control.ts";

const connector = [
  "id: files",
  "name: Files",
  "transport:",
  "  stdio:",
  "    command: npx",
  "",
].join("\n");

let folder: string;
let store: MemoryTrustStore;

beforeEach(async () => {
  folder = await realpath(await mkdtemp(join(tmpdir(), "halonic-trust-status-")));
  await mkdir(join(folder, "library/connectors"), { recursive: true });
  await writeFile(join(folder, "workspace.yaml"), "id: acme\nname: Acme\n");
  await writeFile(join(folder, "library/connectors/files.connector.yaml"), connector);
  store = new MemoryTrustStore();
});

afterEach(async () => {
  await rm(folder, { recursive: true, force: true });
});

function sourcesOf(path = "/usr/bin/npx"): WorkspaceTrustSources {
  return {
    definitions: new FolderDefinitionStore(folder, folder),
    folder: new FileSystemFolderReader(folder, folder),
    findCommand: async () => path,
    digest: webCryptoDigest,
    trust: new TrustService({
      store,
      digest: webCryptoDigest,
      clock: fixedClock(),
      appVersion: "0.1.0",
    }),
  };
}

async function viewOf(path?: string): Promise<WorkspaceTrustView> {
  const trust = new WorkspaceTrust(sourcesOf(path));
  await trust.refresh();
  return new WorkspaceTrustView(trust, "/work/acme");
}

verifies("studio.workspace-trust-status", () => {
  it("has no status before the first answer, then not-trusted", async () => {
    const trust = new WorkspaceTrust(sourcesOf());
    const view = new WorkspaceTrustView(trust, "/work/acme");
    expect(view.status).toBe("unknown");
    expect(view.trustedAt).toBeUndefined();

    await trust.refresh();

    expect(view.status).toBe("not-trusted");
    expect(view.trustedAt).toBeUndefined();
  });

  it("is trusted with the day the person trusted it", async () => {
    const view = await viewOf();
    await view.grant(view.review()?.fingerprint ?? "");

    expect(view.status).toBe("trusted");
    expect(view.trustedAt).toBe(fixedClock().now().toISOString());
  });

  it("is changed, with the day of the earlier trust, when the workspace no longer matches", async () => {
    const first = await viewOf();
    await first.grant(first.review()?.fingerprint ?? "");

    const moved = await viewOf("/opt/bin/npx");

    expect(moved.status).toBe("changed");
    expect(moved.trustedAt).toBe(fixedClock().now().toISOString());
  });

  it("forgets the record when trust is removed, and checks again", async () => {
    const view = await viewOf();
    await view.grant(view.review()?.fingerprint ?? "");
    expect((await store.list()).length).toBe(1);

    expect(await view.remove()).toEqual({ ok: true });

    expect(await store.list()).toEqual([]);
    expect(view.status).toBe("not-trusted");
    expect(view.badge).toBe("not-trusted");
  });

  it("says why when nothing was read yet", async () => {
    const view = new WorkspaceTrustView(new WorkspaceTrust(sourcesOf()), "/work/acme");

    expect(await view.remove()).toEqual({
      ok: false,
      reason: "Halonic hasn't read this workspace yet",
    });
  });

  it("says why when the record can't be forgotten", async () => {
    const failing = sourcesOf();
    const trust = new WorkspaceTrust({
      ...failing,
      trust: new TrustService({
        store: Object.assign(Object.create(store), {
          revoke: async () => {
            throw new Error("the disk is full");
          },
        }),
        digest: webCryptoDigest,
        clock: fixedClock(),
        appVersion: "0.1.0",
      }),
    });
    await trust.refresh();
    const view = new WorkspaceTrustView(trust, "/work/acme");

    expect(await view.remove()).toEqual({ ok: false, reason: "the disk is full" });
  });
});
