import { cp, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { FolderDefinitionStore } from "@halonicjs/adapter-fs-node";
import { MemoryConnectionSettingsStore } from "@halonicjs/adapter-memory";
import { ConnectionSettings, type SendingSettings } from "@halonicjs/app";
import { verifies } from "@halonicjs/testing-spec";
import { type LoadedWorkspace, loadWorkspace } from "@halonicjs/workspace";
import { afterEach, beforeEach, expect, it } from "vitest";
import { runSendingSettings } from "./run-sending.ts";
import { removeTestFolder } from "./test/remove-folder.ts";

const acmeExample = fileURLToPath(new URL("../../../examples/acme", import.meta.url));
const location = "/workspaces/acme";

let folder: string;

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "halonic-cli-run-sending-"));
});

afterEach(async () => {
  await removeTestFolder(folder);
});

/** Acme with the Google connector `mailbox` and the stdio connector `notes`, in a copy under `folder`. */
async function acmeWithConnectors(): Promise<LoadedWorkspace> {
  const acme = join(folder, "acme");
  await cp(acmeExample, acme, { recursive: true });
  const connectors = join(acme, "library", "connectors");
  await mkdir(connectors, { recursive: true });
  await writeFile(
    join(connectors, "mailbox.connector.yaml"),
    "name: Mailbox\ntransport:\n  google:\n    account: family@example.com\n",
  );
  await writeFile(
    join(connectors, "notes.connector.yaml"),
    "name: Notes\ntransport:\n  stdio:\n    command: node\n",
  );
  return await loadWorkspace(new FolderDefinitionStore(acme, "./acme"));
}

/** The settings in a memory store, as `halonic google allow-sending` saves them. */
function savedSettings(): ConnectionSettings {
  return new ConnectionSettings({
    store: new MemoryConnectionSettingsStore(),
    clock: { now: () => new Date("2026-11-22T09:00:00.000Z") },
  });
}

verifies("cli.commands.google.allow-sending", () => {
  it("lets a run's Google connector send once sending is switched on for this workspace", async () => {
    const saved = savedSettings();
    await saved.setAllowSending({ location, connector: "mailbox" }, true);
    const sending = runSendingSettings(saved, await acmeWithConnectors());

    expect(await sending.checkSending({ location, connector: "mailbox" })).toEqual({
      allowed: true,
    });
    expect(
      await sending.checkSending({ location: "/workspaces/other", connector: "mailbox" }),
    ).toMatchObject({ allowed: false });
  });

  it("names the allow-sending command when a Google connector's sending is off", async () => {
    const sending = runSendingSettings(savedSettings(), await acmeWithConnectors());

    expect(await sending.checkSending({ location, connector: "mailbox" })).toEqual({
      allowed: false,
      reason:
        'sending is off for the connector "mailbox". To switch it on, run halonic google allow-sending mailbox on.',
    });
  });

  it("says Halonic can't switch it on yet for a connector that isn't a Google one", async () => {
    const saved = savedSettings();
    await saved.setAllowSending({ location, connector: "notes" }, false);
    const sending = runSendingSettings(saved, await acmeWithConnectors());

    expect(await sending.checkSending({ location, connector: "notes" })).toEqual({
      allowed: false,
      reason: `sending is off for the connector "notes". Halonic can't switch it on yet.`,
    });
  });

  it("keeps the store's error of settings it can't read, for the host, with the next step", async () => {
    const error = new Error("EACCES: the connections folder");
    const unreadable: SendingSettings = {
      checkSending: async () => ({ allowed: false, reason: "the settings can't be read", error }),
    };
    const sending = runSendingSettings(unreadable, await acmeWithConnectors());

    expect(await sending.checkSending({ location, connector: "mailbox" })).toEqual({
      allowed: false,
      reason:
        "the settings can't be read. To switch it on, run halonic google allow-sending mailbox on.",
      error,
    });
  });
});
