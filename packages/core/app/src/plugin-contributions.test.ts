import type { Clock, Digest } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { type PluginEntry, PluginService } from "./plugin-service.ts";
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

/** A plugin with one local tool started by a script, and no backend and no `ui`. */
const filesManifest = `id: files
version: 1.0.0
sdk: 1
name: Files
localTools:
  - id: lister
    start:
      script: { program: node, path: server.js }
    tools:
      - { name: list-files, description: Lists the files in a folder., risk: read, untrusted: true }
`;

/** The weather plugin under the id `id`. */
function weatherFiles(id: string): Record<string, string> {
  return {
    [`${id}/plugin.yaml`]: weatherManifest.replace("id: weather", `id: ${id}`),
    [`${id}/backend/index.js`]: "export default {};\n",
  };
}

/**
 * Loads `broken`, `files`, `hail`, `rain` and `weather` after a person
 * trusted `files`, `hail` and `weather`, and `hail` changed since.
 */
async function loadedPlugins(): Promise<{ service: PluginService; entries: PluginEntry[] }> {
  const reader = new TestFolderReader().putFiles({
    "broken/plugin.yaml": "id: broken\n",
    "files/plugin.yaml": filesManifest,
    "files/server.js": "// the MCP server\n",
    ...weatherFiles("hail"),
    ...weatherFiles("rain"),
    ...weatherFiles("weather"),
  });
  const clock: Clock = { now: () => new Date("2026-11-10T09:00:00.000Z") };
  const trust = new TrustService({
    store: new TestTrustStore(),
    digest,
    clock,
    appVersion: "0.1.0",
  });
  const service = new PluginService({
    plugins: reader,
    digest,
    trust,
    records: new TestRecordStore(),
    clock,
  });
  for (const entry of await service.load()) {
    if (entry.status === "new" && entry.folder !== "rain") {
      await service.trust(entry.folder, entry.fingerprint, "prompt");
    }
  }
  reader.putFiles({ "hail/backend/index.js": "export default { changed: true };\n" });
  return { service, entries: await service.load() };
}

verifies("app.plugin-contributions", () => {
  it("gives a trusted plugin's declared tools by part, backend first, with its grant", async () => {
    const { service, entries } = await loadedPlugins();
    const weather = service.tools(entries).filter((set) => set.plugin === "weather");
    expect(weather.map((set) => set.part)).toEqual(["backend", "local:files"]);
    const [backend, files] = weather;
    expect(
      backend?.declared.map(({ name, risk, untrusted }) => ({ name, risk, untrusted })),
    ).toEqual([
      { name: "forecast", risk: "read", untrusted: true },
      { name: "post-report", risk: "send", untrusted: false },
    ]);
    expect(files?.declared.map((tool) => tool.name)).toEqual(["list-files"]);
    expect(backend?.trust.location).toBe("/profile/plugins/weather");
    expect(files?.trust).toBe(backend?.trust);
  });

  it("gives a trusted plugin's ui as plain data, with its id and name", async () => {
    const { service, entries } = await loadedPlugins();
    expect(service.ui(entries)).toEqual([
      {
        plugin: "weather",
        name: "Weather",
        ui: {
          settings: { root: { label: "Folder", type: "text", required: true } },
          commands: [
            {
              id: "forecast",
              title: "Show the forecast",
              tool: "forecast",
              form: {},
              show: "text",
            },
          ],
          cards: [],
        },
      },
    ]);
  });

  it("gives nothing for a plugin that is new, changed or broken", async () => {
    const { service, entries } = await loadedPlugins();
    expect(entries.map((entry) => [entry.folder, entry.status])).toEqual([
      ["broken", "broken"],
      ["files", "trusted"],
      ["hail", "changed"],
      ["rain", "new"],
      ["weather", "trusted"],
    ]);
    const givers = new Set(service.tools(entries).map((set) => set.plugin));
    expect([...givers]).toEqual(["files", "weather"]);
    expect(service.ui(entries).map((contribution) => contribution.plugin)).toEqual(["weather"]);
  });

  it("gives no backend set and no ui for a plugin with only local tools", async () => {
    const { service, entries } = await loadedPlugins();
    const files = service.tools(entries).filter((set) => set.plugin === "files");
    expect(files.map((set) => set.part)).toEqual(["local:lister"]);
  });
});
