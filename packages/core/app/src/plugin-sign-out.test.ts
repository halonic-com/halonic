import type { Clock, Digest } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { PluginService } from "./plugin-service.ts";
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

/**
 * The weather plugin added and trusted, over a host sign-out that notes, for
 * each plugin it signs out, whether a trust record was still there, and that
 * fails while `failing` is set.
 */
async function setup() {
  const clock: Clock = { now: () => new Date("2026-11-21T09:00:00.000Z") };
  const store = new TestTrustStore();
  const folder = new TestPluginFolder();
  const signedOut: { id: string; trusted: boolean }[] = [];
  const host = { failing: false };
  const service = new PluginService({
    plugins: folder.reader,
    writer: folder,
    digest,
    trust: new TrustService({ store, digest, clock, appVersion: "0.1.0" }),
    records: new TestRecordStore(),
    clock,
    signOut: async (id) => {
      signedOut.push({ id, trusted: (await store.list()).length > 0 });
      if (host.failing) throw new Error("the agent host isn't running");
    },
  });
  const source = new TestFolderReader().putFiles({
    "plugin.yaml": weatherManifest,
    "backend/index.js": "export default {};\n",
  });
  const added = await service.add(source, {
    from: { kind: "folder", path: "/sources/weather" },
    replace: false,
  });
  if (!added.ok || added.value.status === "broken")
    throw new Error("expected the plugin to be added");
  await service.trust("weather", added.value.fingerprint, "prompt");
  const status = async () => (await service.load()).map((entry) => entry.status);
  const deleted: string[] = [];
  const deleteSecret = async (name: string) => void deleted.push(name);
  return { service, store, folder, signedOut, host, status, deleted, deleteSecret };
}

verifies("app.plugin-sign-out", () => {
  it("signs out a plugin while it is still trusted, then forgets the trust", async () => {
    const { service, signedOut, status } = await setup();

    await service.revoke("weather");

    expect(signedOut).toEqual([{ id: "weather", trusted: true }]);
    expect(await status()).toEqual(["new"]);
  });

  it("signs out a removed plugin before its trust, secrets and folder are gone", async () => {
    const { service, signedOut, deleted, deleteSecret, folder } = await setup();

    expect((await service.remove("weather", deleteSecret)).ok).toBe(true);

    expect(signedOut).toEqual([{ id: "weather", trusted: true }]);
    expect(deleted).toHaveLength(2);
    expect(await folder.reader.entries()).toEqual([]);
  });

  it("forgets the trust when the sign-out fails, and gives its error", async () => {
    const { service, host, status } = await setup();
    host.failing = true;

    await expect(service.revoke("weather")).rejects.toThrow("the agent host isn't running");

    expect(await status()).toEqual(["new"]);
  });

  it("keeps the folder and secrets when a remove's sign-out fails, and removing again finishes", async () => {
    const { service, host, signedOut, deleted, deleteSecret, folder, status } = await setup();
    host.failing = true;

    await expect(service.remove("weather", deleteSecret)).rejects.toThrow();

    expect(deleted).toEqual([]);
    expect(await status()).toEqual(["new"]);
    host.failing = false;
    expect((await service.remove("weather", deleteSecret)).ok).toBe(true);
    expect(signedOut.map((each) => each.id)).toEqual(["weather", "weather"]);
    expect(await folder.reader.entries()).toEqual([]);
  });

  it("still signs out a plugin whose entry is a link or gone", async () => {
    const { service, signedOut, folder, deleteSecret } = await setup();
    await service.remove("weather", deleteSecret);
    signedOut.length = 0;

    await service.revoke("weather");
    await service.remove("weather", deleteSecret);
    folder.reader.putLink("weather");
    await service.remove("weather", deleteSecret);

    expect(signedOut).toEqual([
      { id: "weather", trusted: false },
      { id: "weather", trusted: false },
      { id: "weather", trusted: false },
    ]);
  });
});
