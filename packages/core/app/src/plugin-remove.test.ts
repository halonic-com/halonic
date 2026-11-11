import type { Clock, Digest } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it, vi } from "vitest";
import type { PluginSource } from "./plugin-installs.ts";
import { type PluginEntry, PluginService, type ReadPlugin } from "./plugin-service.ts";
import { weatherManifest } from "./testing/plugin-fixtures.ts";
import { TestFolderReader } from "./testing/test-folder-reader.ts";
import { TestPluginFolder } from "./testing/test-plugin-folder.ts";
import { TestRecordStore } from "./testing/test-record-store.ts";
import { TestTrustStore } from "./testing/test-trust-store.ts";
import { TrustService } from "./trust-service.ts";

/** SHA-256 from Web Crypto, as the platforms' `Digest` adapters give it. */
const digest: Digest = {
  async sha256(data) {
    return new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(data)));
  },
};

const from: PluginSource = { kind: "folder", path: "/sources/weather" };

/** The stored names of the weather plugin's two secrets. */
const weatherSecrets = ["plugin__weather__example-key", "plugin__weather__acme-key"];

function weatherSource(): TestFolderReader {
  return new TestFolderReader().putFiles({
    "plugin.yaml": weatherManifest,
    "backend/index.js": "export default {};\n",
  });
}

/** A secret writer that keeps the names it deleted, and fails for `failing`. */
function secretWriter(failing?: string) {
  const deleted: string[] = [];
  const deleteSecret = async (storedName: string) => {
    if (storedName === failing) throw new Error("the keychain is locked");
    deleted.push(storedName);
  };
  return { deleted, deleteSecret };
}

/** The weather plugin added, trusted and with its settings saved. */
async function setup() {
  const clock: Clock = { now: () => new Date("2026-11-11T09:00:00.000Z") };
  const store = new TestTrustStore();
  const trust = new TrustService({ store, digest, clock, appVersion: "0.1.0" });
  const folder = new TestPluginFolder();
  const service = new PluginService({
    plugins: folder.reader,
    writer: folder,
    digest,
    trust,
    records: new TestRecordStore(),
    clock,
  });
  const added = await service.add(weatherSource(), { from, replace: false });
  if (!added.ok || added.value.status !== "new") throw new Error("expected a new plugin");
  const plugin = (added.value as ReadPlugin).plugin;
  await service.trust("weather", added.value.fingerprint, "prompt");
  await service.saveSettings(plugin, { root: "~/Documents" });
  return { folder, service, store, trust, plugin };
}

function statuses(entries: readonly PluginEntry[]): [string, string][] {
  return entries.map((entry) => [entry.folder, entry.status]);
}

verifies("app.plugin-remove", () => {
  it("removes the plugin with its trust, secrets, settings and install record", async () => {
    const { folder, service, store, plugin } = await setup();
    const { deleted, deleteSecret } = secretWriter();
    expect(await service.remove("weather", deleteSecret)).toEqual({ ok: true, value: undefined });
    expect(deleted.sort()).toEqual([...weatherSecrets].sort());
    expect(await folder.reader.entries()).toEqual([]);
    expect(await store.list()).toEqual([]);
    expect(await service.settings(plugin)).toEqual({});
    expect(await service.install("weather")).toBeNull();
  });

  it("shows a fresh trust check when the same plugin is added again", async () => {
    const { service } = await setup();
    await service.remove("weather", secretWriter().deleteSecret);
    const again = await service.add(weatherSource(), { from, replace: false });
    expect(again.ok && again.value.status).toBe("new");
  });

  it("stops at a secret it can't delete, naming it, and keeps the folder, settings and record", async () => {
    const { folder, service, plugin } = await setup();
    const failing = secretWriter("plugin__weather__acme-key");
    expect(await service.remove("weather", failing.deleteSecret)).toEqual({
      ok: false,
      error: { kind: "secret", secret: "acme-key", reason: "the keychain is locked" },
    });
    expect(await folder.reader.read("weather/plugin.yaml")).not.toBeNull();
    expect(await service.settings(plugin)).toEqual({ root: "~/Documents" });
    expect(await service.install("weather")).not.toBeNull();
    expect(statuses(await service.load())).toEqual([["weather", "new"]]);

    expect((await service.remove("weather", secretWriter().deleteSecret)).ok).toBe(true);
    expect(await folder.reader.entries()).toEqual([]);
  });

  it("removes a link itself without revoking, with the secret names it was added with", async () => {
    const { folder, service, trust } = await setup();
    folder.reader.remove("weather");
    folder.reader.putLink("weather");
    const revoke = vi.spyOn(trust, "revoke");
    const { deleted, deleteSecret } = secretWriter();
    expect((await service.remove("weather", deleteSecret)).ok).toBe(true);
    expect(revoke).not.toHaveBeenCalled();
    expect(deleted.sort()).toEqual([...weatherSecrets].sort());
    expect(await folder.reader.entries()).toEqual([]);
    expect(await service.install("weather")).toBeNull();
  });

  it("removes a plugin it can't read any more, with the secret names it was added with", async () => {
    const { folder, service } = await setup();
    folder.reader.putFiles({ "weather/plugin.yaml": "id: weather\n" });
    const { deleted, deleteSecret } = secretWriter();
    expect((await service.remove("weather", deleteSecret)).ok).toBe(true);
    expect(deleted.sort()).toEqual([...weatherSecrets].sort());
    expect(await folder.reader.entries()).toEqual([]);
  });

  it("also deletes a secret the plugin declares now but didn't when it was added", async () => {
    const { folder, service } = await setup();
    const declared = weatherManifest.replace(
      "    example-key:\n",
      "    extra-key: { purpose: Another key, hosts: [api.example.com], as: header, header: x-extra }\n    example-key:\n",
    );
    folder.reader.putFiles({ "weather/plugin.yaml": declared });
    const { deleted, deleteSecret } = secretWriter();
    await service.remove("weather", deleteSecret);
    expect(deleted.sort()).toEqual([...weatherSecrets, "plugin__weather__extra-key"].sort());
  });

  it("leaves a plugin whose id differs only in case, and does nothing when there is none", async () => {
    const { folder, service } = await setup();
    const { deleted, deleteSecret } = secretWriter();
    expect((await service.remove("Weather", deleteSecret)).ok).toBe(true);
    expect((await service.remove("rain", deleteSecret)).ok).toBe(true);
    expect(deleted).toEqual([]);
    expect(statuses(await service.load())).toEqual([["weather", "trusted"]]);
    expect(await folder.reader.read("weather/plugin.yaml")).not.toBeNull();
  });

  it("refuses an id that isn't one folder name before anything is touched", async () => {
    const { service } = await setup();
    const { deleted, deleteSecret } = secretWriter();
    await expect(service.remove("../weather", deleteSecret)).rejects.toThrow(RangeError);
    expect(deleted).toEqual([]);
    expect(statuses(await service.load())).toEqual([["weather", "trusted"]]);
  });
});
