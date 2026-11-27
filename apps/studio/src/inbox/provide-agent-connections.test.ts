import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentHostRequestRoute } from "@halonicjs/adapter-agent-host-client";
import { FileSystemFolderReader, FolderDefinitionStore } from "@halonicjs/adapter-fs-node";
import { webCryptoDigest } from "@halonicjs/adapter-fs-tauri";
import { MemoryTrustStore } from "@halonicjs/adapter-memory";
import { ServiceRegistry, TrustService } from "@halonicjs/app";
import { fixedClock } from "@halonicjs/std";
import { serviceSignInKey } from "@halonicjs/studio-services";
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

/**
 * An agent host that lists no connections, and the shell's restore, which
 * gives no key back; it records every route and restore Studio asks for.
 */
function recordingHost() {
  const asked: string[] = [];
  const { promise: firstAsk, resolve } = Promise.withResolvers<void>();
  const transport = {
    request: async (route: AgentHostRequestRoute) => {
      asked.push(route);
      resolve();
      return { status: 200, body: { workspace: folder, connections: [] } };
    },
    stream: async () => ({ ok: false as const, answer: { status: 404, body: null } }),
    restorePaperclipKeys: async (workspace: string) => {
      asked.push(`agent_host_paperclip_restore ${workspace}`);
      resolve();
      return 0;
    },
    paperclipKeyKept: async (workspace: string, connection: string) => {
      asked.push(`agent_host_paperclip_key_kept ${workspace} ${connection}`);
      return true;
    },
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
    expect(host.asked).toEqual([`agent_host_paperclip_restore ${folder}`]);
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

verifies("services.service-sign-in", () => {
  it("provides the stepper's sign-in, which asks the shell whether it keeps a key first", async () => {
    const host = recordingHost();
    const listed = {
      workspace: folder,
      connections: [
        {
          id: "paperclip:halonic",
          name: "halonic",
          label: "Paperclip · Halonic",
          address: "https://paperclip.acme.test",
          company: "acme-company",
          state: { kind: "no-key" },
        },
      ],
    };
    const transport = { ...host.transport, request: async () => ({ status: 200, body: listed }) };
    const services = new ServiceRegistry();
    provideAgentConnections(services, transport, folder, trustOfFolder());

    const ref = {
      service: "paperclip",
      connection: "halonic",
      host: "paperclip.acme.test",
    } as const;
    const started = await services.get(serviceSignInKey).start(ref, { test: true });

    expect(started).toEqual({ outcome: "refused", reason: "already-signed-in" });
    expect(host.asked).toContain(`agent_host_paperclip_key_kept ${folder} halonic`);
  });
});
