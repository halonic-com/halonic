import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentHostRequestRoute } from "@halonicjs/adapter-agent-host-client";
import { FileSystemFolderReader, FolderDefinitionStore } from "@halonicjs/adapter-fs-node";
import { webCryptoDigest } from "@halonicjs/adapter-fs-tauri";
import { MemoryTrustStore } from "@halonicjs/adapter-memory";
import { ServiceRegistry, TrustService } from "@halonicjs/app";
import { fixedClock } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it } from "vitest";
import { WorkspaceTrust } from "../studio/workspace-trust.ts";
import { provideAgentConnections } from "./provide-agent-connections.ts";

let folder: string;

/**
 * The demo after the person connected Paperclip in it: the test model only,
 * and the connection file the agent host wrote (`connections/paperclip/`).
 */
beforeEach(async () => {
  folder = await realpath(await mkdtemp(join(tmpdir(), "halonic-restore-")));
  await mkdir(join(folder, "providers"), { recursive: true });
  await mkdir(join(folder, "connections/paperclip"), { recursive: true });
  await writeFile(join(folder, "workspace.yaml"), "id: acme\nname: Acme\n");
  await writeFile(join(folder, "providers/main.yaml"), "id: main\ntype: mock\n");
  await writeFile(
    join(folder, "connections/paperclip/halonic.yaml"),
    "label: Halonic\naddress: https://paperclip.acme.test\ncompany: acme-company\n",
  );
});

afterEach(async () => {
  await rm(folder, { recursive: true, force: true });
});

/** The folder's trust, read through Node as the desktop shell reads it. */
function trustOfFolder(reader = new FileSystemFolderReader(folder, folder)): WorkspaceTrust {
  return new WorkspaceTrust({
    definitions: new FolderDefinitionStore(folder, folder),
    folder: reader,
    findCommand: async () => undefined,
    digest: webCryptoDigest,
    trust: new TrustService({
      store: new MemoryTrustStore(),
      digest: webCryptoDigest,
      clock: fixedClock(),
      appVersion: "0.1.0",
    }),
  });
}

/** An agent host that lists no connections and records every route Studio asks it. */
function recordingHost() {
  const asked: AgentHostRequestRoute[] = [];
  const { promise: firstAsk, resolve } = Promise.withResolvers<void>();
  const transport = {
    request: async (route: AgentHostRequestRoute) => {
      asked.push(route);
      resolve();
      return { status: 200, body: { workspace: folder, connections: [] } };
    },
    stream: async () => ({ ok: false as const, answer: { status: 404, body: null } }),
  };
  return { asked, firstAsk, transport };
}

/** Lets a not-awaited restore that was going to start reach the host. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

verifies("services.paperclip-restore", () => {
  it("restores at open in a workspace with a Paperclip connection that needs no trust", async () => {
    const trust = trustOfFolder();
    const host = recordingHost();
    provideAgentConnections(new ServiceRegistry(), host.transport, folder, trust);

    await trust.refresh();
    await host.firstAsk;

    expect(trust.needsNoTrust).toBe(true);
    expect(trust.isTrusted()).toBe(false);
    expect(host.asked).toEqual(["POST /v1/paperclip/connections"]);
  });

  it("asks the host nothing while the check runs, or after it failed", async () => {
    const trust = trustOfFolder(new FileSystemFolderReader(join(folder, "gone"), "gone"));
    const host = recordingHost();
    provideAgentConnections(new ServiceRegistry(), host.transport, folder, trust);

    const check = trust.refresh();
    await settle();
    expect(host.asked).toEqual([]);
    await check;
    await settle();

    expect(trust.failure).toBeDefined();
    expect(host.asked).toEqual([]);
  });
});
