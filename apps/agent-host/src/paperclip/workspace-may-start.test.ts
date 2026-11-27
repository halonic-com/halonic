import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { FolderDefinitionStore } from "@halonicjs/adapter-fs-node";
import { MemoryTrustStore } from "@halonicjs/adapter-memory";
import {
  readWorkspaceTrust,
  type TrustReadMachine,
  webCryptoDigest,
} from "@halonicjs/adapter-workspace-engine-node";
import { TrustService } from "@halonicjs/app";
import type { TrustRecord } from "@halonicjs/ports";
import { fixedClock } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { loadWorkspace } from "@halonicjs/workspace";
import { afterEach, beforeEach, expect, it } from "vitest";
import { type WorkspaceMayStart, workspaceMayStartWith } from "./workspace-may-start.ts";

const acmeExample = fileURLToPath(new URL("../../../../examples/acme", import.meta.url));

/** A trust store whose records can't be read once it is damaged, as a damaged trust folder's. */
class DamageableTrustStore extends MemoryTrustStore {
  damaged = false;

  override async get(location: string): Promise<TrustRecord | null> {
    if (this.damaged) throw new Error("The trust record can't be read.");
    return super.get(location);
  }
}

let folder: string;
let acme: string;
let profile: string;
let store: MemoryTrustStore;
let reported: unknown[];

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "acme-may-start-"));
  acme = join(folder, "acme");
  profile = join(folder, "profile");
  await mkdir(profile);
  await cp(acmeExample, acme, { recursive: true });
  // The demo: a Paperclip connection, which needs no trust of its own.
  await mkdir(join(acme, "connections", "paperclip"), { recursive: true });
  await writeFile(
    join(acme, "connections", "paperclip", "halonic.yaml"),
    "label: Halonic\naddress: https://paperclip.acme.test\ncompany: acme-company\n",
  );
  store = new MemoryTrustStore();
  reported = [];
});

afterEach(() => rm(folder, { recursive: true, force: true }));

function machineWith(trustStore: MemoryTrustStore): TrustReadMachine {
  return {
    trustStore,
    clock: fixedClock(Date.UTC(2026, 10, 27, 9, 0)),
    commandSearch: { path: undefined, endings: [] },
  };
}

function mayStartWith(trustStore: MemoryTrustStore = store): WorkspaceMayStart {
  return workspaceMayStartWith({
    machine: () => machineWith(trustStore),
    fence: profile,
    report: (error) => reported.push(error),
  });
}

/** Acme no longer local only, with a connector that starts a program: it needs trust. */
async function needingTrust(): Promise<void> {
  const settings = join(acme, "workspace.yaml");
  await writeFile(
    settings,
    (await readFile(settings, "utf8")).replace("localOnly: true", "localOnly: false"),
  );
  await writeConnector("server.js");
}

async function writeConnector(script: string): Promise<void> {
  await mkdir(join(acme, "library", "connectors"), { recursive: true });
  await writeFile(
    join(acme, "library", "connectors", "files.connector.yaml"),
    JSON.stringify({ transport: { stdio: { command: "node", args: [script] } } }),
  );
}

/** Trusts Acme as it is now, as a person does with `halonic trust`. */
async function trust(): Promise<void> {
  const machine = machineWith(store);
  const dir = { root: acme, shown: acme, name: basename(acme) };
  const version = {
    workspace: await loadWorkspace(new FolderDefinitionStore(acme, acme, { fence: profile })),
    integrations: [],
  };
  const { subject } = await readWorkspaceTrust(dir, machine.commandSearch, version);
  const service = new TrustService({
    store,
    digest: webCryptoDigest,
    clock: machine.clock,
    appVersion: "0.1.0",
  });
  const check = await service.check(subject);
  if (!("fingerprint" in check)) throw new Error("Acme has no fingerprint.");
  await service.grant(subject, check.fingerprint, "cli");
}

verifies("agent-host.paperclip-may-start", () => {
  it("lets the demo start: local only, the test model and a connection file, with no trust record", async () => {
    expect(await mayStartWith()(acme)).toBe(true);
  });

  it("refuses a workspace with a connector and no trust record", async () => {
    await needingTrust();
    expect(await mayStartWith()(acme)).toBe(false);
  });

  it("lets a trusted workspace start, and refuses it once its connector changed", async () => {
    await needingTrust();
    await trust();
    const mayStart = mayStartWith();
    expect(await mayStart(acme)).toBe(true);

    await writeConnector("other.js");

    expect(await mayStart(acme)).toBe(false);
  });

  it("refuses a workspace whose trust record can't be read", async () => {
    // The grant is in the store that gets damaged, so only the read error refuses.
    const damageable = new DamageableTrustStore();
    store = damageable;
    await needingTrust();
    await trust();
    const mayStart = mayStartWith();
    expect(await mayStart(acme)).toBe(true);

    damageable.damaged = true;

    expect(await mayStart(acme)).toBe(false);
  });

  it("refuses a folder that isn't a workspace, and reports why", async () => {
    const missing = join(folder, "missing");
    expect(await mayStartWith()(missing)).toBe(false);
    expect(reported).toHaveLength(1);
  });
});
