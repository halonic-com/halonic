import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { FolderDefinitionStore } from "@halonicjs/adapter-fs-node";
import { MemoryTrustStore } from "@halonicjs/adapter-memory";
import { TrustService } from "@halonicjs/app";
import type { TrustRecord } from "@halonicjs/ports";
import { fixedClock } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { loadWorkspace } from "@halonicjs/workspace";
import { afterEach, beforeEach, expect, it } from "vitest";
import { removeTestFolder } from "./test/remove-folder.ts";
import { webCryptoDigest } from "./web-crypto-digest.ts";
import { type TrustGateSentences, workspaceTrustGate } from "./workspace-trust-gate.ts";
import {
  readWorkspaceTrust,
  type TrustReadMachine,
  type WorkspaceAtVersion,
  workspaceTrustState,
} from "./workspace-trust-state.ts";

const acmeExample = fileURLToPath(new URL("../../../../examples/acme", import.meta.url));

/** A store that counts its writes, so a test can show reading trust never writes. */
class CountingTrustStore extends MemoryTrustStore {
  writes = 0;

  override async grant(record: TrustRecord): Promise<void> {
    this.writes += 1;
    await super.grant(record);
  }
}

let folder: string;
let acme: string;
let store: CountingTrustStore;
let machine: TrustReadMachine;

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "halonic-read-only-trust-"));
  acme = join(folder, "acme");
  await cp(acmeExample, acme, { recursive: true });
  // Acme is local only and reaches only the test model; a connector that
  // starts a program makes it need trust.
  const settings = join(acme, "workspace.yaml");
  await writeFile(
    settings,
    (await readFile(settings, "utf8")).replace("localOnly: true", "localOnly: false"),
  );
  await writeConnector("files", "server.js");
  store = new CountingTrustStore();
  machine = {
    trustStore: store,
    clock: fixedClock(Date.UTC(2026, 10, 23, 18, 0)),
    commandSearch: { path: undefined, endings: [] },
  };
});

afterEach(() => removeTestFolder(folder));

async function writeConnector(id: string, script: string): Promise<void> {
  await mkdir(join(acme, "library", "connectors"), { recursive: true });
  await writeFile(
    join(acme, "library", "connectors", `${id}.connector.yaml`),
    JSON.stringify({ transport: { stdio: { command: "node", args: [script] } } }),
  );
}

const dir = () => ({ root: acme, shown: "./acme", name: basename(acme) });

async function savedVersion(): Promise<WorkspaceAtVersion> {
  return {
    workspace: await loadWorkspace(new FolderDefinitionStore(acme, "./acme")),
    integrations: [],
  };
}

/** Trusts the workspace as a person does with `halonic trust`. */
async function trust(): Promise<void> {
  const { subject } = await readWorkspaceTrust(dir(), machine.commandSearch, await savedVersion());
  const service = new TrustService({
    store,
    digest: webCryptoDigest,
    clock: machine.clock,
    appVersion: "0.1.0",
  });
  const check = await service.check(subject);
  if (!("fingerprint" in check)) throw new Error("The workspace has no fingerprint.");
  await service.grant(subject, check.fingerprint, "cli");
  store.writes = 0;
}

const sentences: TrustGateSentences = {
  trusted: () => "trusted",
  new: () => "new",
  changed: () => "changed",
  unreadable: () => "unreadable",
  refused: () => "refused",
  "not-needed": () => "needs no trust",
};

verifies("workspace-engine-node.read-only-trust", () => {
  it("answers new for a workspace that was never trusted", async () => {
    expect(await workspaceTrustState(dir(), machine, savedVersion)).toEqual({
      state: "new",
      refused: [],
    });
  });

  it("answers trusted after a connector is removed, without shrinking the record", async () => {
    await writeConnector("notes", "notes.js");
    await trust();
    await rm(join(acme, "library", "connectors", "notes.connector.yaml"));

    const answer = await workspaceTrustState(dir(), machine, savedVersion);

    expect(answer.state).toBe("trusted");
    expect(store.writes).toBe(0);
  });

  it("answers changed after an edit, and writes nothing", async () => {
    await trust();
    await writeConnector("files", "other.js");

    expect((await workspaceTrustState(dir(), machine, savedVersion)).state).toBe("changed");
    expect(store.writes).toBe(0);
  });

  it("counts a version it can't read as unreadable, never trusted", async () => {
    await trust();

    const answer = await workspaceTrustState(dir(), machine, () =>
      Promise.reject(new Error("gone")),
    );

    expect(answer).toEqual({ state: "unreadable", refused: [] });
  });

  it("gates with the caller's sentences, and answers trusted when no trust is needed", async () => {
    const gate = workspaceTrustGate(dir(), machine, savedVersion, sentences);
    expect(await gate.check()).toEqual({ state: "new", message: "new" });

    await rm(join(acme, "library"), { recursive: true, force: true });

    expect(await gate.check()).toEqual({ state: "trusted", message: "needs no trust" });
  });
});
