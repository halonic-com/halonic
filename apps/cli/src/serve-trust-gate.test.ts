import { cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { FileTrustStore } from "@halonicjs/adapter-fs-node";
import { fixedClock } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { plainText } from "./messages/phrase.ts";
import { serveMessages } from "./messages/serve.ts";
import { workspaceTrustGate } from "./serve-trust-gate.ts";
import { turnOffLocalOnly } from "./test/local-only.ts";
import { openWorkspaceDir } from "./workspace-dir.ts";
import {
  cliTrustService,
  readWorkspaceTrust,
  type WorkspaceTrustMachine,
} from "./workspace-trust.ts";

const acmeExample = fileURLToPath(new URL("../../../examples/acme", import.meta.url));

let folder: string;
let acme: string;
let machine: WorkspaceTrustMachine;

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "halonic-serve-trust-gate-"));
  acme = join(folder, "acme");
  await cp(acmeExample, acme, { recursive: true });
  machine = {
    trustStore: new FileTrustStore(join(folder, "trust")),
    clock: fixedClock(Date.UTC(2026, 10, 10, 14, 1)),
    commandSearch: { path: undefined, endings: [] },
  };
});

afterEach(() => rm(folder, { recursive: true, force: true }));

async function gate() {
  const dir = await openWorkspaceDir({ positionals: [], options: { dir: acme } }, { cwd: folder });
  return { dir, gate: workspaceTrustGate(dir, machine) };
}

/** Trusts the workspace as `halonic trust` does, for the fingerprint it shows. */
async function trust(): Promise<void> {
  const { dir } = await gate();
  const { subject } = await readWorkspaceTrust(dir, machine.commandSearch);
  const service = cliTrustService(machine.trustStore, machine.clock);
  const check = await service.check(subject);
  if (!("fingerprint" in check)) throw new Error("The workspace has no fingerprint.");
  await service.grant(subject, check.fingerprint, "cli");
}

verifies("cli.serve-trust-gate", () => {
  it("answers new for a workspace that was never trusted", async () => {
    const { gate: g } = await gate();

    expect(await g.check()).toEqual({
      state: "new",
      message: plainText(serveMessages.trustNew().phrase),
    });
  });

  it("answers trusted once a person trusted it, and changed at once after an edit", async () => {
    await trust();
    const { gate: g } = await gate();
    expect((await g.check()).state).toBe("trusted");

    await turnOffLocalOnly(acme);
    // The edit trust must notice: a connector that starts a program.
    await mkdir(join(acme, "library", "connectors"), { recursive: true });
    await writeFile(
      join(acme, "library", "connectors", "files.connector.yaml"),
      JSON.stringify({ transport: { stdio: { command: "node", args: ["server.js"] } } }),
    );

    expect((await g.check()).state).toBe("changed");
  });

  it("counts a trust record it can't read as unreadable, never trusted", async () => {
    await trust();
    machine = {
      ...machine,
      trustStore: {
        ...machine.trustStore,
        get: async () => {
          throw new Error("disk gone");
        },
      },
    };
    const { gate: g } = await gate();

    const decision = await g.check();

    expect(decision.state).toBe("unreadable");
    expect(decision.message).not.toContain("disk gone");
  });

  it("names no file, path or fingerprint in its sentences", async () => {
    const { gate: g } = await gate();

    expect((await g.check()).message).not.toContain(folder);
  });
});
