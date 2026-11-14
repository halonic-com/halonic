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
import { shownDate } from "./trust-review.ts";
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
  folder = await realpath(await mkdtemp(join(tmpdir(), "halonic-trust-review-")));
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

verifies("studio.workspace-trust-review", () => {
  it("shows no badge before the first answer and the badge for an untrusted workspace", async () => {
    const trust = new WorkspaceTrust(sourcesOf());
    const view = new WorkspaceTrustView(trust, "/work/acme");
    expect(view.badge).toBe("none");
    expect(view.review()).toBeUndefined();

    await trust.refresh();

    expect(view.badge).toBe("not-trusted");
  });

  it("builds the first-time check in the CLI's words, with the unpinned program's warning", async () => {
    const view = await viewOf();
    const review = view.review();

    expect(review?.title).toBe("Trust Acme?");
    expect(review?.source).toBe("Acme · /work/acme");
    expect(review?.changed).toBe(false);
    expect(review?.summary).toEqual(["Will start 1 program."]);
    expect(review?.sections.map((section) => section.heading)).toEqual(["Programs (1)"]);
    expect(review?.sections[0]?.open).toBe(true);
    expect(review?.sections[0]?.rows[0]?.warning).toBe(
      "Can download new code from npm when it starts: version not pinned.",
    );
    expect(review?.unpinned).toEqual(["files"]);
    expect(review?.fingerprint).toMatch(/^hfp1:/);
    // The same object until the check changes, so the window can compare it.
    expect(view.review()).toBe(review);
  });

  it("says there is nothing to trust for a workspace that starts nothing", async () => {
    await rm(join(folder, "library"), { recursive: true });

    const review = (await viewOf()).review();

    expect(review?.summary).toEqual([
      "Nothing in this workspace starts a program or reaches an address.",
    ]);
    expect(review?.sections).toEqual([]);
  });

  it("trusts exactly the fingerprint shown, then has nothing to review", async () => {
    const view = await viewOf();
    const shown = view.review()?.fingerprint ?? "";

    expect(await view.grant(shown)).toEqual({ ok: true });

    expect(view.badge).toBe("none");
    expect(view.review()).toBeUndefined();
  });

  it("saves nothing for a fingerprint that is no longer the workspace's", async () => {
    const view = await viewOf();

    const result = await view.grant("hfp1:not-what-was-shown");

    expect(result).toEqual({ ok: false, reason: "this workspace changed" });
    expect(view.badge).toBe("not-trusted");
  });

  it("says what changed for a workspace whose record no longer matches", async () => {
    const first = await viewOf();
    await first.grant(first.review()?.fingerprint ?? "");

    const moved = await viewOf("/opt/bin/npx");
    const review = moved.review();
    const since = shownDate(fixedClock().now().toISOString());

    expect(moved.badge).toBe("changed");
    expect(review?.changed).toBe(true);
    expect(review?.title).toBe(`Acme changed since you trusted it on ${since}`);
    expect(review?.summary).toEqual([`1 changed program since you trusted this on ${since}.`]);
    expect(review?.sections[0]?.rows[0]).toMatchObject({ id: "files", tag: "Changed" });
  });

  it("notifies the window when a check starts and ends", async () => {
    const trust = new WorkspaceTrust(sourcesOf());
    const view = new WorkspaceTrustView(trust, "/work/acme");
    let calls = 0;
    const stop = view.subscribe(() => {
      calls += 1;
    });

    await trust.refresh();
    stop();
    await trust.refresh();

    expect(calls).toBe(2);
  });

  it("keeps showing the last check while a new one runs, and trusts nothing meanwhile", async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => (release = resolve));
    let hold = false;
    const sources = sourcesOf();
    const trust = new WorkspaceTrust({
      ...sources,
      findCommand: async (command) => {
        if (hold) await gate;
        return sources.findCommand(command);
      },
    });
    await trust.refresh();
    const view = new WorkspaceTrustView(trust, "/work/acme");
    await view.grant(view.review()?.fingerprint ?? "");
    expect(trust.isTrusted()).toBe(true);

    hold = true;
    const running = trust.refresh();

    expect(trust.isTrusted()).toBe(false);
    expect(trust.check?.status).toBe("trusted");
    expect(view.badge).toBe("none");
    release();
    await running;
    expect(trust.isTrusted()).toBe(true);
  });

  it("keeps the badge and the open check on screen while a new check runs", async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => (release = resolve));
    let hold = false;
    const sources = sourcesOf();
    const trust = new WorkspaceTrust({
      ...sources,
      findCommand: async (command) => {
        if (hold) await gate;
        return sources.findCommand(command);
      },
    });
    await trust.refresh();
    const view = new WorkspaceTrustView(trust, "/work/acme");
    const before = view.review();

    hold = true;
    const running = trust.refresh();

    expect(view.badge).toBe("not-trusted");
    expect(view.review()).toBe(before);
    release();
    await running;
    expect(view.review()).toEqual(before);
  });
});
