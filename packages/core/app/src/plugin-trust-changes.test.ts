import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { pluginTrustChanges } from "./plugin-trust-changes.ts";
import { type PluginTrustContent, pluginTrustContent } from "./plugin-trust-content.ts";
import { pluginFrom, weatherFiles, weatherManifest } from "./testing/plugin-fixtures.ts";

const trusted = pluginTrustContent({ plugin: pluginFrom(), files: weatherFiles });

/** The weather plugin's content with `from` replaced by `to` in its manifest. */
function contentWith(from: string, to: string): PluginTrustContent {
  expect(weatherManifest).toContain(from);
  return pluginTrustContent({
    plugin: pluginFrom(weatherManifest.replace(from, to)),
    files: weatherFiles,
  });
}

/** The changes from the trusted weather plugin, which must be readable. */
function changesTo(current: PluginTrustContent) {
  const changes = pluginTrustChanges(trusted, current);
  if (!changes.readable) throw new Error("the trusted content should be readable");
  return changes;
}

verifies("app.plugin-trust-changes", () => {
  it("finds nothing changed in the same content", () => {
    const changes = changesTo(trusted);
    expect(changes.plugin).toEqual([]);
    expect(changes.manifest).toEqual([]);
    expect(changes.tools).toEqual({ added: [], changed: [], removed: [] });
    expect(changes.files).toEqual({ added: [], changed: [], removed: [] });
  });

  it("names a tool whose risk changed, with before and after", () => {
    const changes = changesTo(contentWith("risk: send", "risk: write"));
    expect(changes.tools.changed).toEqual([
      {
        before: { part: "backend", name: "post-report", risk: "send", untrusted: false },
        after: { part: "backend", name: "post-report", risk: "write", untrusted: false },
        fields: ["risk"],
      },
    ]);
    expect(changes.manifest).toEqual(["backend"]);
  });

  it("names a local tool whose pin changed", () => {
    const changes = changesTo(contentWith("version: 3.1.4", "version: 3.2.0"));
    expect(changes.localTools.changed.map((change) => change.fields)).toEqual([["start"]]);
  });

  it("shows a new host as added, and a host taken away as removed", () => {
    const wider = contentWith("network: [api.acme.com]", "network: [api.acme.com, files.acme.com]");
    expect(changesTo(wider).hosts.added).toEqual([{ part: "local:files", host: "files.acme.com" }]);
    const narrower = pluginTrustChanges(wider, trusted);
    expect(narrower.readable && narrower.hosts.removed).toEqual([
      { part: "local:files", host: "files.acme.com" },
    ]);
  });

  it("counts a removed tool as a change, never as a shrink", () => {
    const changes = changesTo(
      contentWith(
        "    - { name: post-report, description: Posts a weather report., risk: send, noun: { one: report, many: reports }, untrusted: false }\n",
        "",
      ),
    );
    expect(changes.tools.removed.map((tool) => tool.name)).toEqual(["post-report"]);
    expect(changes).not.toHaveProperty("onlyRemoves");
  });

  it("names files added, changed and removed, by path", () => {
    const files = [
      { path: "plugin.yaml", sha256: "a".repeat(64) },
      { path: "backend/index.js", sha256: "c".repeat(64) },
      { path: "backend/extra.js", sha256: "d".repeat(64) },
    ];
    const changes = changesTo({ ...trusted, files });
    expect(changes.files).toEqual({
      added: ["backend/extra.js"],
      changed: ["backend/index.js"],
      removed: [],
    });
    const fewer = changesTo({
      ...trusted,
      files: [{ path: "plugin.yaml", sha256: "a".repeat(64) }],
    });
    expect(fewer.files.removed).toEqual(["backend/index.js"]);
  });

  it("names a manifest field the prompt doesn't list, and the plugin's own fields", () => {
    const changes = changesTo(
      contentWith(
        "version: 1.2.0\nsdk: 1\nname: Weather\ndescription: Forecasts",
        "version: 1.3.0\nsdk: 1\nname: Weather\ndescription: Weather",
      ),
    );
    expect(changes.plugin).toEqual(["version"]);
    expect(changes.manifest).toEqual(["description", "version"]);
  });

  it("can't read content that isn't plugin content, such as a hand edit", () => {
    for (const content of [
      null,
      "hpf1:x",
      { connectors: [] },
      { ...trusted, tools: [{ name: 3 }] },
    ]) {
      expect(pluginTrustChanges(content, trusted)).toEqual({ readable: false });
    }
  });
});
