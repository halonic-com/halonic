import type { Clock, Digest } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { CommandBus, CommandError } from "./command-bus.ts";
import { type PluginCommands, registerPluginCommands } from "./plugin-commands.ts";
import type { PluginSource } from "./plugin-installs.ts";
import { PluginService } from "./plugin-service.ts";
import { weatherManifest } from "./testing/plugin-fixtures.ts";
import { TestFolderReader } from "./testing/test-folder-reader.ts";
import { TestPluginFolder } from "./testing/test-plugin-folder.ts";
import { TestRecordStore } from "./testing/test-record-store.ts";
import { TestTrustStore } from "./testing/test-trust-store.ts";
import { TrustService } from "./trust-service.ts";
import { WorkspaceScope } from "./workspace-scope.ts";

/** SHA-256 from Web Crypto, as the platforms' `Digest` adapters give it. */
const digest: Digest = {
  async sha256(data) {
    return new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(data)));
  },
};

const from: PluginSource = { kind: "folder", path: "/sources/weather" };

function weatherSource(): TestFolderReader {
  return new TestFolderReader().putFiles({
    "plugin.yaml": weatherManifest,
    "backend/index.js": "export default {};\n",
  });
}

/** A workspace's bus with the plugin commands on one service, and the secrets they deleted. */
function setup() {
  const clock: Clock = { now: () => new Date("2026-11-12T09:00:00.000Z") };
  const store = new TestTrustStore();
  const folder = new TestPluginFolder();
  const service = new PluginService({
    plugins: folder.reader,
    writer: folder,
    digest,
    trust: new TrustService({ store, digest, clock, appVersion: "0.1.0" }),
    records: new TestRecordStore(),
    clock,
  });
  const deleted: string[] = [];
  const scope = new WorkspaceScope({
    location: "memory:acme",
    onListenerError: (error) => {
      throw error;
    },
  });
  const unregister = registerPluginCommands(scope.commands, {
    service,
    deleteSecret: async (name) => {
      deleted.push(name);
    },
  });
  return { commands: scope.commands, service, store, deleted, unregister };
}

verifies("app.plugin-commands", () => {
  it("adds, lists, trusts, turns off and removes a plugin through the workspace's commands", async () => {
    const { commands, store, deleted } = setup();

    const added = await commands.execute("plugins.add", { source: weatherSource(), from });
    if (!added.ok) throw new Error("expected the plugin to be added");
    expect(added.value.status).toBe("new");
    const fingerprint = added.value.status === "broken" ? "" : added.value.fingerprint;

    const trusted = await commands.execute("plugins.trust", { id: "weather", fingerprint });
    expect(trusted.ok).toBe(true);
    expect((await store.list()).map((record) => record.origin)).toEqual(["prompt"]);
    expect((await commands.execute("plugins.list")).map((entry) => entry.status)).toEqual([
      "trusted",
    ]);

    await commands.execute("plugins.revoke", { id: "weather" });
    expect((await commands.execute("plugins.list")).map((entry) => entry.status)).toEqual(["new"]);

    expect(await commands.execute("plugins.remove", { id: "weather" })).toEqual({
      ok: true,
      value: undefined,
    });
    expect(deleted.length).toBeGreaterThan(0);
    expect(await commands.execute("plugins.list")).toEqual([]);
  });

  it("refuses a fingerprint that isn't the plugin's own", async () => {
    const { commands } = setup();
    await commands.execute("plugins.add", { source: weatherSource(), from });

    const trusted = await commands.execute("plugins.trust", {
      id: "weather",
      fingerprint: `hpf1:${"0".repeat(64)}`,
    });

    expect(trusted.ok).toBe(false);
  });

  it("removes its handlers again", async () => {
    const { commands, unregister } = setup();

    unregister();

    await expect(commands.execute("plugins.list")).rejects.toThrow(CommandError);
  });

  it("leaves the bus as it was when a plugin command already has a handler", async () => {
    const { service } = setup();
    const bus = new CommandBus<PluginCommands>();
    bus.register("plugins.remove", () => ({ ok: true, value: undefined }));

    expect(() => registerPluginCommands(bus, { service, deleteSecret: async () => {} })).toThrow(
      CommandError,
    );
    await expect(bus.execute("plugins.list")).rejects.toThrow(CommandError);
  });
});
