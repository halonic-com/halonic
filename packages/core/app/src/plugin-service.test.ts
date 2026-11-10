import type { Clock, Digest, TrustRecord } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it, vi } from "vitest";
import { type PluginEntry, PluginService, type ReadPlugin } from "./plugin-service.ts";
import { weatherManifest } from "./testing/plugin-fixtures.ts";
import { TestFolderReader } from "./testing/test-folder-reader.ts";
import { TestRecordStore } from "./testing/test-record-store.ts";
import { TestTrustStore } from "./testing/test-trust-store.ts";
import { TrustService } from "./trust-service.ts";

/** SHA-256 from Web Crypto, as the platforms' `Digest` adapters give it. */
const digest: Digest = {
  async sha256(data) {
    return new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(data)));
  },
};

/** A trust store whose record for one location can't be read, as one damaged file would. */
class OneBrokenRecordStore extends TestTrustStore {
  readonly #brokenLocation: string;

  constructor(brokenLocation: string) {
    super();
    this.#brokenLocation = brokenLocation;
  }

  override async get(location: string): Promise<TrustRecord | null> {
    if (location === this.#brokenLocation) throw new Error(`${location}'s record can't be read`);
    return await super.get(location);
  }
}

/** A plugin folder `id` holding the weather plugin under that id. */
function pluginFiles(id: string): Record<string, string> {
  return {
    [`${id}/plugin.yaml`]: weatherManifest.replace("id: weather", `id: ${id}`),
    [`${id}/backend/index.js`]: "export default {};\n",
  };
}

/** The plugin folders `rain` and `weather`, and `broken` between them, whose manifest isn't one. */
function plugins(): TestFolderReader {
  return new TestFolderReader().putFiles({
    ...pluginFiles("rain"),
    ...pluginFiles("weather"),
    "broken/plugin.yaml": "id: broken\n",
  });
}

function setup(reader = plugins(), store = new TestTrustStore()) {
  const clock: Clock = { now: () => new Date("2026-11-10T09:00:00.000Z") };
  const trust = new TrustService({ store, digest, clock, appVersion: "0.1.0" });
  const records = new TestRecordStore();
  return { trust, service: new PluginService({ plugins: reader, digest, trust, records, clock }) };
}

/** The plugin `folder` as loaded, which must have been read and checked. */
async function loadOne(service: PluginService, folder: string): Promise<ReadPlugin> {
  const entry = (await service.load()).find((found) => found.folder === folder);
  if (entry === undefined || entry.status === "broken")
    throw new Error(`expected ${folder} to load`);
  return entry;
}

function statuses(entries: readonly PluginEntry[]): [string, string][] {
  return entries.map((entry) => [entry.folder, entry.status]);
}

verifies("app.plugin-service", () => {
  it("gives every plugin folder, sorted, with its trust status, and a broken one between", async () => {
    const entries = await setup().service.load();
    expect(statuses(entries)).toEqual([
      ["broken", "broken"],
      ["rain", "new"],
      ["weather", "new"],
    ]);
    const [broken, , weather] = entries;
    expect(broken?.status === "broken" && broken.problems.length).toBeGreaterThan(0);
    expect(weather).toMatchObject({
      location: "/profile/plugins/weather",
      plugin: { id: "weather" },
      fingerprint: expect.stringMatching(/^hpf1:/u),
    });
  });

  it("gives a grant for a trusted plugin, and turns it off when a file changes", async () => {
    const reader = plugins();
    const { trust, service } = setup(reader);
    const weather = (await service.load()).find((entry) => entry.folder === "weather");
    if (weather?.status !== "new") throw new Error("expected a new weather plugin");
    const subject = {
      location: weather.location,
      plugin: weather.plugin,
      files: weather.content.files,
    };
    expect((await trust.grantPlugin(subject, weather.fingerprint, "prompt")).ok).toBe(true);

    const trusted = (await service.load()).find((entry) => entry.folder === "weather");
    expect(trusted).toMatchObject({ status: "trusted", grant: { location: weather.location } });

    reader.putFiles({ "weather/backend/index.js": "export default { changed: true };\n" });
    const changed = (await service.load()).find((entry) => entry.folder === "weather");
    expect(changed?.status).toBe("changed");
    expect(changed).not.toHaveProperty("grant");
  });

  it("keeps loading the others when one plugin's trust record can't be read", async () => {
    const store = new OneBrokenRecordStore("/profile/plugins/rain");
    const entries = await setup(plugins(), store).service.load();
    expect(statuses(entries)).toEqual([
      ["broken", "broken"],
      ["rain", "unreadable"],
      ["weather", "new"],
    ]);
  });

  it("keeps loading the others when a plugin's files vanish or fail while they're read", async () => {
    const reader = plugins();
    reader.beforeRead = (path) => {
      if (path === "rain/backend/index.js") reader.remove("rain");
      if (path === "weather/backend/index.js") throw new RangeError("it became a link");
    };
    const [, rain, weather] = await setup(reader).service.load();
    expect(rain?.status === "broken" && rain.problems[0]?.code).toBe("changed-while-read");
    expect(weather?.status === "broken" && weather.problems[0]?.code).toBe("read-failed");
    expect(weather?.status === "broken" && weather.problems[0]?.message).toContain(
      "it became a link",
    );
  });

  it("skips a file at the top, and gives a link where a plugin folder should be as broken", async () => {
    const reader = new TestFolderReader()
      .putFiles({ ...pluginFiles("weather"), ".DS_Store": "" })
      .putLink("rain");
    const entries = await setup(reader).service.load();
    expect(statuses(entries)).toEqual([
      ["rain", "broken"],
      ["weather", "new"],
    ]);
    expect(entries[0]?.status === "broken" && entries[0].problems[0]?.code).toBe("link");
  });

  it("trusts a plugin with the fingerprint shown, and revoking makes it new again", async () => {
    const { service } = setup();
    const weather = await loadOne(service, "weather");
    const granted = await service.trust("weather", weather.fingerprint, "prompt");
    expect(granted).toMatchObject({ ok: true, value: { location: "/profile/plugins/weather" } });
    expect((await loadOne(service, "weather")).status).toBe("trusted");

    await service.revoke("weather");
    expect((await loadOne(service, "weather")).status).toBe("new");
  });

  it("refuses trust when the plugin changed since it was shown, or is broken now", async () => {
    const reader = plugins();
    const { service } = setup(reader);
    const shown = await loadOne(service, "weather");
    reader.putFiles({ "weather/backend/index.js": "export default { changed: true };\n" });
    const refused = await service.trust("weather", shown.fingerprint, "prompt");
    expect(refused.ok).toBe(false);
    if (refused.ok || refused.error.kind !== "fingerprint-changed") {
      throw new Error("expected a changed fingerprint");
    }
    expect(refused.error.fingerprint).toMatch(/^hpf1:/u);
    expect(refused.error.fingerprint).not.toBe(shown.fingerprint);
    expect((await loadOne(service, "weather")).status).toBe("new");

    const broken = await service.trust("broken", shown.fingerprint, "prompt");
    expect(
      !broken.ok && broken.error.kind === "broken" && broken.error.problems.length,
    ).toBeGreaterThan(0);
  });

  it("refuses an id that isn't one folder name before reading the plugin folder", async () => {
    const reader = plugins();
    const read = vi.spyOn(reader, "entries");
    const { service } = setup(reader);
    for (const id of ["../weather", "weather/backend", "weather\\backend", "", ".."]) {
      await expect(service.trust(id, "hpf1:0", "prompt")).rejects.toThrow(RangeError);
      await expect(service.revoke(id)).rejects.toThrow(RangeError);
    }
    expect(read).not.toHaveBeenCalled();
  });

  it("saves a plugin's settings, and forgets them without touching its trust", async () => {
    const { service } = setup();
    const weather = await loadOne(service, "weather");
    expect((await service.saveSettings(weather.plugin, { root: "~/Weather" })).ok).toBe(true);
    expect(await service.settings(weather.plugin)).toEqual({ root: "~/Weather" });

    await service.forget("weather");
    expect(await service.settings(weather.plugin)).toEqual({});
    expect((await loadOne(service, "weather")).status).toBe("new");
  });

  it("gives the names a plugin's secrets are kept under", async () => {
    const { service } = setup();
    const weather = await loadOne(service, "weather");
    expect(service.secretNames(weather.plugin)).toEqual({
      "example-key": "plugin__weather__example-key",
      "acme-key": "plugin__weather__acme-key",
    });
  });

  it("gives no plugins for an empty plugin folder, and fails only when it can't be listed", async () => {
    expect(await setup(new TestFolderReader()).service.load()).toEqual([]);
    const unlisted = new TestFolderReader();
    unlisted.entries = async () => {
      throw new Error("the plugin folder can't be listed");
    };
    await expect(setup(unlisted).service.load()).rejects.toThrow("can't be listed");
  });
});
