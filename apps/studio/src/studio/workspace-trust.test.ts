import { mkdir, mkdtemp, realpath, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileSystemFolderReader, FolderDefinitionStore } from "@halonicjs/adapter-fs-node";
import { webCryptoDigest } from "@halonicjs/adapter-fs-tauri";
import { MemoryDefinitionStore, MemoryTrustStore } from "@halonicjs/adapter-memory";
import { readLocalIntegrations, TrustService, trustSubjectOf } from "@halonicjs/app";
import { fixedClock } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { loadWorkspace } from "@halonicjs/workspace";
import { afterEach, beforeEach, expect, it } from "vitest";
import { WorkspaceTrust, type WorkspaceTrustSources } from "./workspace-trust.ts";

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
  folder = await realpath(await mkdtemp(join(tmpdir(), "halonic-trust-")));
  await mkdir(join(folder, "library/connectors"), { recursive: true });
  await writeFile(join(folder, "workspace.yaml"), "id: acme\nname: Acme\n");
  await writeFile(join(folder, "library/connectors/files.connector.yaml"), connector);
  store = new MemoryTrustStore();
});

afterEach(async () => {
  await rm(folder, { recursive: true, force: true });
});

function trustService(): TrustService {
  return new TrustService({
    store,
    digest: webCryptoDigest,
    clock: fixedClock(),
    appVersion: "0.1.0",
  });
}

function sourcesOf(overrides: Partial<WorkspaceTrustSources> = {}): WorkspaceTrustSources {
  return {
    definitions: new FolderDefinitionStore(folder, folder),
    folder: new FileSystemFolderReader(folder, folder),
    findCommand: async () => "/usr/bin/npx",
    digest: webCryptoDigest,
    trust: trustService(),
    ...overrides,
  };
}

/** The subject the CLI builds for the folder, with the same shared pieces and Node's readers. */
async function cliSubject() {
  const reader = new FileSystemFolderReader(folder, folder);
  const workspace = await loadWorkspace(new FolderDefinitionStore(folder, folder));
  return trustSubjectOf({
    workspace,
    integrations: await readLocalIntegrations(reader, webCryptoDigest),
    location: await realpath(folder),
    commandPaths: new Map([["npx", "/usr/bin/npx"]]),
  });
}

verifies("studio.workspace-trust", () => {
  it("is not trusted before the first check and takes its name from workspace.yaml", async () => {
    const trust = new WorkspaceTrust(sourcesOf());

    expect(trust.isTrusted()).toBe(false);
    expect(trust.name).toBeUndefined();
    await trust.refresh();

    expect(trust.name).toBe("Acme");
    expect(trust.check?.status).toBe("new");
    expect(trust.isTrusted()).toBe(false);
  });

  it("gets the fingerprint the CLI gets for the same folder", async () => {
    const trust = new WorkspaceTrust(sourcesOf());

    await trust.refresh();

    const cli = await trustService().check(await cliSubject());
    expect(trust.check?.status === "refused").toBe(false);
    expect(trust.check && "fingerprint" in trust.check && trust.check.fingerprint).toBe(
      "fingerprint" in cli && cli.fingerprint,
    );
  });

  it("is trusted once a person trusted exactly what the folder holds", async () => {
    const trust = new WorkspaceTrust(sourcesOf());
    await trust.refresh();
    const shown = trust.check;
    if (shown === undefined || shown.status === "refused") throw new Error("expected a check");

    await trustService().grant(await cliSubject(), shown.fingerprint, "prompt");
    await trust.refresh();

    expect(trust.isTrusted()).toBe(true);
  });

  it("asks again when a connector's program moves", async () => {
    const trust = new WorkspaceTrust(sourcesOf());
    await trust.refresh();
    const shown = trust.check;
    if (shown === undefined || shown.status === "refused") throw new Error("expected a check");
    await trustService().grant(await cliSubject(), shown.fingerprint, "prompt");

    const moved = new WorkspaceTrust(sourcesOf({ findCommand: async () => "/opt/bin/npx" }));
    await moved.refresh();

    expect(moved.check?.status).toBe("changed");
    expect(moved.isTrusted()).toBe(false);
  });

  it("is not trusted while it checks again", async () => {
    const trust = new WorkspaceTrust(sourcesOf());
    const shown = await cliSubject();
    await trust.refresh();
    const check = trust.check;
    if (check === undefined || check.status === "refused") throw new Error("expected a check");
    await trustService().grant(shown, check.fingerprint, "prompt");
    await trust.refresh();
    expect(trust.isTrusted()).toBe(true);

    const again = trust.refresh();

    expect(trust.isTrusted()).toBe(false);
    await again;
    expect(trust.isTrusted()).toBe(true);
  });

  it("stays untrusted, without rejecting, when the folder can't be read", async () => {
    const trust = new WorkspaceTrust(
      sourcesOf({
        definitions: new MemoryDefinitionStore({}),
        folder: new FileSystemFolderReader(join(folder, "gone"), "gone"),
      }),
    );

    await trust.refresh();

    expect(trust.check).toBeUndefined();
    expect(trust.isTrusted()).toBe(false);
  });
});

verifies("studio.untrusted-starts-nothing", () => {
  const loaded = () => loadWorkspace(new FolderDefinitionStore(folder, folder));

  /** Leaves the folder with one provider and no connector. */
  async function onlyProvider(provider: string): Promise<void> {
    await unlink(join(folder, "library/connectors/files.connector.yaml"));
    await mkdir(join(folder, "providers"), { recursive: true });
    await writeFile(join(folder, "providers/main.yaml"), provider);
  }

  it("lets a workspace that reaches only the test model start without trust", async () => {
    await onlyProvider("id: main\ntype: mock\n");
    const trust = new WorkspaceTrust(sourcesOf());

    await expect(trust.mayStart(await loaded())).resolves.toBe(true);
    await trust.refresh();
    expect(trust.isTrusted()).toBe(false);
    expect(trust.mayStartNow()).toBe(true);
  });

  it("stops an untrusted workspace with a keyless model server on this computer", async () => {
    await onlyProvider(
      "id: main\ntype: openai-compatible\nbaseUrl: http://localhost:11434/v1\nlocal: true\n",
    );
    const trust = new WorkspaceTrust(sourcesOf());

    await expect(trust.mayStart(await loaded())).resolves.toBe(false);
    await trust.refresh();
    expect(trust.mayStartNow()).toBe(false);
  });

  it("stops an untrusted workspace whose provider keeps its key at its own address", async () => {
    await onlyProvider("id: main\ntype: anthropic\nsecret: anthropic-key\n");

    await expect(new WorkspaceTrust(sourcesOf()).mayStart(await loaded())).resolves.toBe(false);
  });

  it("lets a trusted workspace start", async () => {
    const trust = new WorkspaceTrust(sourcesOf());
    await trust.refresh();
    const check = trust.check;
    if (check === undefined || check.status === "refused") throw new Error("expected a check");
    await trustService().grant(await cliSubject(), check.fingerprint, "prompt");

    await expect(trust.mayStart(await loaded())).resolves.toBe(true);
  });

  it("says no, without rejecting, when the check fails, and while a check runs", async () => {
    await onlyProvider("id: main\ntype: mock\n");
    const broken = new WorkspaceTrust(
      sourcesOf({ folder: new FileSystemFolderReader(join(folder, "gone"), "gone") }),
    );
    await expect(broken.mayStart(await loaded())).resolves.toBe(false);

    const trust = new WorkspaceTrust(sourcesOf());
    await trust.refresh();
    const again = trust.refresh();
    expect(trust.mayStartNow()).toBe(false);
    await again;
    expect(trust.mayStartNow()).toBe(true);
  });
});
