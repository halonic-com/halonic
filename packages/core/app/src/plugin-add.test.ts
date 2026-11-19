import type { Clock, Digest, FolderReader } from "@halonicjs/ports";
import { encodeUtf8 } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { MAX_PLUGIN_ENTRIES } from "./plugin-folder.ts";
import type { PluginSource } from "./plugin-installs.ts";
import { type AddedPluginEntry, PluginService } from "./plugin-service.ts";
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

const code = "export default {};\n";

const from: PluginSource = { kind: "folder", path: "/sources/Weather-Plugin" };

/** The weather plugin's source folder, which has a name of its own, with `extra` files. */
function weatherSource(extra: Record<string, string> = {}): TestFolderReader {
  return new TestFolderReader().putFiles({
    "plugin.yaml": weatherManifest,
    "backend/index.js": code,
    ...extra,
  });
}

/** `reader` with its real location at `location`, as a reader on a disk gives it. */
function locatedAt(reader: TestFolderReader, location: string): FolderReader {
  return {
    location,
    entries: (dir, options) => reader.entries(dir, options),
    read: (path) => reader.read(path),
    locationOf: async (path) => (path === undefined ? location : await reader.locationOf(path)),
  };
}

function setup(halonicData?: readonly string[]) {
  const clock: Clock = { now: () => new Date("2026-11-11T09:00:00.000Z") };
  const trust = new TrustService({
    store: new TestTrustStore(),
    digest,
    clock,
    appVersion: "0.1.0",
  });
  const folder = new TestPluginFolder();
  const service = new PluginService({
    plugins: folder.reader,
    writer: folder,
    digest,
    trust,
    records: new TestRecordStore(),
    clock,
    ...(halonicData === undefined ? {} : { halonicData }),
  });
  return { folder, service };
}

/** Every path in the plugins folder. */
async function pathsIn(folder: TestPluginFolder): Promise<string[]> {
  return (await folder.reader.entries()).map((entry) => entry.path);
}

/** The entry `add` gave, which must have been added. */
function added(result: Awaited<ReturnType<PluginService["add"]>>): AddedPluginEntry {
  if (!result.ok) throw new Error(`expected the plugin to be added: ${JSON.stringify(result)}`);
  return result.value;
}

/** The problem codes of a refused `add`, which must have refused it as broken. */
function brokenCodes(result: Awaited<ReturnType<PluginService["add"]>>): string[] {
  if (result.ok || result.error.kind !== "broken") {
    throw new Error(`expected a broken refusal: ${JSON.stringify(result)}`);
  }
  return result.error.problems.map((problem) => problem.code);
}

verifies("app.plugin-add", () => {
  it("adds a source folder as the folder named by its id, new and with its install record", async () => {
    const { folder, service } = setup();
    const entry = added(await service.add(weatherSource(), { from, replace: false }));
    expect(entry).toMatchObject({ status: "new", folder: "weather" });
    expect(await pathsIn(folder)).toEqual([
      "weather",
      "weather/backend",
      "weather/backend/index.js",
      "weather/plugin.yaml",
    ]);
    expect(await folder.reader.read("weather/plugin.yaml")).toEqual(encodeUtf8(weatherManifest));

    const install = await service.install("weather");
    expect(install).toMatchObject({
      source: from,
      addedAt: "2026-11-11T09:00:00.000Z",
      secretNames: {
        "example-key": "plugin__weather__example-key",
        "acme-key": "plugin__weather__acme-key",
      },
    });
    expect(install?.files.map((file) => file.path)).toEqual(["backend/index.js", "plugin.yaml"]);
  });

  it("gives the fingerprint a person trusts, and the plugin is trusted on the next load", async () => {
    const { service } = setup();
    const entry = added(await service.add(weatherSource(), { from, replace: false }));
    if (entry.status !== "new") throw new Error("expected a new plugin");
    expect((await service.trust("weather", entry.fingerprint, "prompt")).ok).toBe(true);
    expect((await service.load()).map((loaded) => loaded.status)).toEqual(["trusted"]);
  });

  it("places the bytes it checked, even when the source changes while it is read", async () => {
    const { folder, service } = setup();
    const source = weatherSource();
    source.beforeRead = (path) => {
      if (path === "backend/index.js") source.putFiles({ "plugin.yaml": "id: swapped\n" });
    };
    added(await service.add(source, { from, replace: false }));
    expect(await folder.reader.read("weather/plugin.yaml")).toEqual(encodeUtf8(weatherManifest));
  });

  it("refuses a source it can't check, and writes nothing", async () => {
    const { folder, service } = setup();
    const source = new TestFolderReader().putFiles({ "plugin.yaml": "id: weather\n" });
    expect(brokenCodes(await service.add(source, { from, replace: false })).length).toBeGreaterThan(
      0,
    );
    expect(await pathsIn(folder)).toEqual([]);
    expect(await service.install("weather")).toBeNull();
  });

  it("refuses a source whose reader fails with its reason, given one full stop", async () => {
    const { folder, service } = setup();
    const source = weatherSource();
    source.entries = async () => {
      throw new Error("Pick the folder again.");
    };
    const result = await service.add(source, { from, replace: false });
    if (result.ok || result.error.kind !== "broken") throw new Error("expected a broken refusal");
    expect(result.error.problems.map((problem) => problem.message)).toEqual([
      "Halonic couldn't read the plugin: Pick the folder again. Load it again; if it keeps failing, remove the plugin and install it again.",
    ]);
    expect(await pathsIn(folder)).toEqual([]);
  });

  it("refuses a source with a link out of it, and writes nothing", async () => {
    const { folder, service } = setup();
    const source = weatherSource().putLink("backend/secrets");
    expect(brokenCodes(await service.add(source, { from, replace: false }))).toEqual(["link"]);
    expect(await pathsIn(folder)).toEqual([]);
  });

  it("refuses a file path that escapes the plugin folder, and writes nothing", async () => {
    const { folder, service } = setup();
    const source = weatherSource({ "../outside.js": code });
    expect(brokenCodes(await service.add(source, { from, replace: false }))).toEqual([
      "unsafe-name",
    ]);
    expect(await pathsIn(folder)).toEqual([]);
  });

  it("refuses a file name another system opens as something else, and writes nothing", async () => {
    const { folder, service } = setup();
    for (const name of ["aux.js", "notes.", "Backend/index.js"]) {
      const result = await service.add(weatherSource({ [name]: code }), { from, replace: false });
      expect(brokenCodes(result)).toEqual(["unsafe-name"]);
    }
    expect(await pathsIn(folder)).toEqual([]);
  });

  it("refuses a source past the limit on files, and writes nothing", async () => {
    const { folder, service } = setup();
    const many = Object.fromEntries(
      Array.from({ length: MAX_PLUGIN_ENTRIES }, (_, index) => [`data/${index}.txt`, ""]),
    );
    const result = await service.add(weatherSource(many), { from, replace: false });
    expect(brokenCodes(result)).toEqual(["too-many-files"]);
    expect(await pathsIn(folder)).toEqual([]);
  });

  it("refuses an id of 49 characters, and writes nothing", async () => {
    const { folder, service } = setup();
    const id = "w".repeat(49);
    const source = new TestFolderReader().putFiles({
      "plugin.yaml": weatherManifest.replace("id: weather", `id: ${id}`),
      "backend/index.js": code,
    });
    expect(brokenCodes(await service.add(source, { from, replace: false })).length).toBeGreaterThan(
      0,
    );
    expect(await pathsIn(folder)).toEqual([]);
  });

  it("gives taken for an id already added in any case, even when replacing", async () => {
    const { folder, service } = setup();
    folder.reader.putFiles({ "Weather/plugin.yaml": "mine" });
    for (const replace of [false, true]) {
      expect(await service.add(weatherSource(), { from, replace })).toEqual({
        ok: false,
        error: { kind: "taken", id: "weather", name: "Weather" },
      });
    }
    expect(await pathsIn(folder)).toEqual(["Weather", "Weather/plugin.yaml"]);
    expect(await service.install("weather")).toBeNull();
  });

  it("gives taken for the same plugin added again, unless it replaces it", async () => {
    const { folder, service } = setup();
    added(await service.add(weatherSource({ "old.js": code }), { from, replace: false }));
    const again = await service.add(weatherSource(), { from, replace: false });
    expect(again).toEqual({ ok: false, error: { kind: "taken", id: "weather", name: "Weather" } });

    const newCommit: PluginSource = {
      kind: "git",
      address: "https://example.com/w.git",
      commit: "a".repeat(40),
    };
    const replaced = added(await service.add(weatherSource(), { from: newCommit, replace: true }));
    expect(replaced.status).toBe("new");
    expect(await folder.reader.read("weather/old.js")).toBeNull();
    expect((await service.install("weather"))?.source).toEqual(newCommit);
  });

  it("shows what changed when it replaces a trusted plugin, which is off until trusted again", async () => {
    const { service } = setup();
    const first = added(await service.add(weatherSource(), { from, replace: false }));
    if (first.status !== "new") throw new Error("expected a new plugin");
    await service.trust("weather", first.fingerprint, "prompt");
    const changedCode = { "backend/index.js": "export default { changed: true };\n" };
    const source = weatherSource(changedCode);
    const replaced = added(await service.add(source, { from, replace: true }));
    expect(replaced.status).toBe("changed");
    expect(service.tools([replaced])).toEqual([]);
  });

  it("keeps the secret names of the version it replaces, even ones the new version dropped", async () => {
    const { service } = setup();
    added(await service.add(weatherSource(), { from, replace: false }));
    const withoutAcme = weatherManifest
      .replace("      ACME_KEY: { secret: acme-key }\n", "")
      .replace(/ {4}secrets:\n {6}acme-key:.*\n/u, "");
    const source = new TestFolderReader().putFiles({
      "plugin.yaml": withoutAcme,
      "backend/index.js": code,
    });
    added(await service.add(source, { from, replace: true }));
    expect((await service.install("weather"))?.secretNames).toEqual({
      "example-key": "plugin__weather__example-key",
      "acme-key": "plugin__weather__acme-key",
    });
  });

  it("keeps no install record when placing fails", async () => {
    const { folder, service } = setup();
    folder.beforePlace = () => {
      throw new Error("the disk is full");
    };
    await expect(service.add(weatherSource(), { from, replace: false })).rejects.toThrow(
      "the disk is full",
    );
    expect(await service.install("weather")).toBeNull();
  });

  it("takes a new copy out again when it can't be read back, and refuses it", async () => {
    const { folder, service } = setup();
    const place = folder.place.bind(folder);
    folder.place = async (id, files, options) => {
      const placed = await place(id, files, options);
      // Something else writes in the plugins folder before it is read back.
      folder.reader.putFiles({ [`${id}/plugin.yaml`]: "id: [" });
      return placed;
    };
    const result = await service.add(weatherSource(), { from, replace: false });
    expect(brokenCodes(result)).not.toEqual([]);
    expect(await pathsIn(folder)).toEqual([]);
    expect(await service.install("weather")).toBeNull();
  });

  it("leaves private names out at any depth, so they are never read or placed", async () => {
    const { folder, service } = setup();
    const source = weatherSource({
      ".env": "KEY=1",
      ".envrc": "x",
      ".studio/state": "x",
      ".git/HEAD": "ref: x\n",
      "backend/.env.local": "KEY=2",
      "vendor/dep/.git/HEAD": "ref: x\n",
      "vendor/dep/lib.js": "1",
    });
    const read: string[] = [];
    source.beforeRead = (path) => {
      read.push(path);
    };
    const result = await service.add(source, { from, replace: false });
    expect(result.ok).toBe(true);
    const placed = await pathsIn(folder);
    expect(placed).toContain("weather/vendor/dep/lib.js");
    expect(placed.filter((path) => /\.(env|git|studio)/u.test(path))).toEqual([]);
    expect(read.filter((path) => /\.(env|git|studio)/u.test(path))).toEqual([]);
  });

  it("leaves out the private folders the sandbox denies at any depth, and names them", async () => {
    const { folder, service } = setup();
    const secrets = {
      ".ssh/id_ed25519": "fake key",
      ".gnupg/private-keys-v1.d/a.key": "fake key",
      ".aws/credentials": "fake key",
      ".config/gcloud/credentials.db": "fake key",
      ".netrc": "fake key",
      ".npmrc": "fake key",
      ".pypirc": "fake key",
      ".docker/config.json": "fake key",
      ".kube/config": "fake key",
      "home/.SSH/id_rsa": "fake key",
      "home/AppData/Roaming/gcloud/credentials.db": "fake key",
    };
    const source = weatherSource({ ...secrets, ".config/app.json": "{}" });
    const read: string[] = [];
    source.beforeRead = (path) => {
      read.push(path);
    };
    const entry = added(await service.add(source, { from, replace: false }));

    expect(entry.leftOut).toEqual([
      ".aws",
      ".config/gcloud",
      ".docker",
      ".gnupg",
      ".kube",
      ".netrc",
      ".npmrc",
      ".pypirc",
      ".ssh",
      "home/.SSH",
      "home/AppData/Roaming/gcloud",
    ]);
    if (entry.status === "broken") throw new Error("expected a checked plugin");
    expect(entry.content.files.map((file) => file.path)).toEqual([
      ".config/app.json",
      "backend/index.js",
      "plugin.yaml",
    ]);
    expect(await pathsIn(folder)).toEqual([
      "weather",
      "weather/.config",
      "weather/.config/app.json",
      "weather/backend",
      "weather/backend/index.js",
      "weather/plugin.yaml",
    ]);
    expect(read.filter((path) => Object.keys(secrets).includes(path))).toEqual([]);
  });

  it("names nothing left out for a source without denied paths", async () => {
    const { service } = setup();
    const entry = added(
      await service.add(weatherSource({ ".env": "KEY=1" }), { from, replace: false }),
    );
    expect(entry.leftOut).toEqual([]);
  });

  it("counts only what it keeps, so a big .git hides no file after it", async () => {
    const objects = Object.fromEntries(
      Array.from({ length: MAX_PLUGIN_ENTRIES + 50 }, (_, index) => [`objects/${index}`, "x"]),
    );
    const prefixed = (prefix: string) =>
      Object.fromEntries(
        Object.entries(objects).map(([path, bytes]) => [`${prefix}/${path}`, bytes]),
      );
    for (const git of [".git", "vendor/dep/.git"]) {
      const { folder, service } = setup();
      const source = weatherSource({ ...prefixed(git), "web/app.js": "1" });
      const result = await service.add(source, { from, replace: false });
      expect(result.ok).toBe(true);
      const placed = await pathsIn(folder);
      expect(placed).toContain("weather/web/app.js");
      expect(placed.filter((path) => path.includes(".git"))).toEqual([]);
    }
  });

  it("still refuses a source past the limit once its private entries are left out", async () => {
    const { folder, service } = setup();
    const many = Object.fromEntries(
      Array.from({ length: MAX_PLUGIN_ENTRIES }, (_, index) => [`web/${index}.js`, "1"]),
    );
    const result = await service.add(weatherSource({ ".env": "KEY=1", ...many }), {
      from,
      replace: false,
    });
    expect(brokenCodes(result)).toEqual(["too-many-files"]);
    expect(await pathsIn(folder)).toEqual([]);
  });

  it.each([
    ["is the profile", "/person/.halonic"],
    ["holds the profile", "/person"],
    ["is inside the profile", "/person/.halonic/plugins/other"],
    ["is the profile in another case and slash", "\\PERSON\\.Halonic"],
    ["is a workspace's data", "/person/work/.studio"],
    ["is inside a workspace's data", "/person/work/.STUDIO/x"],
    ["holds the open workspace's data", "/person/open"],
    ["is everything", "/"],
  ])(
    "refuses a source that %s before reading anything, and writes nothing",
    async (_, location) => {
      const { folder, service } = setup(["/person/.halonic", "/person/open/.studio"]);
      const source = weatherSource();
      const read: string[] = [];
      source.beforeRead = (path) => {
        read.push(path);
      };
      const result = await service.add(locatedAt(source, location), { from, replace: false });
      expect(result).toEqual({ ok: false, error: { kind: "halonic-data" } });
      expect(read).toEqual([]);
      expect(await pathsIn(folder)).toEqual([]);
      expect(await service.install("weather")).toBeNull();
    },
  );

  it("adds a source next to Halonic's data, which neither holds nor is inside it", async () => {
    const { service } = setup(["/person/.halonic"]);
    const source = locatedAt(weatherSource(), "/person/.halonic-plugins/weather");
    expect((await service.add(source, { from, replace: false })).ok).toBe(true);
  });
});
