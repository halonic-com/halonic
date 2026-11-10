import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, describe, expect, it } from "vitest";
import { checkSources } from "./checks.ts";
import { describePluginConformance } from "./describe.ts";
import { weatherSubject } from "./fixtures/weather.ts";
import {
  checkPluginManifest,
  type PluginConformanceSubject,
  pluginBackendSubject,
} from "./plugin.ts";
import { readPluginFolder } from "./plugin-folder.ts";

const weatherFolder = fileURLToPath(new URL("./fixtures/plugins/weather", import.meta.url));
const weatherPlugin: PluginConformanceSubject = {
  folder: weatherFolder,
  backend: weatherSubject.integration,
  recordings: weatherSubject.recordings,
  cases: weatherSubject.cases,
};

// The weather plugin passes the whole suite, the way every real plugin will.
verifies("integration.plugin-conformance", () => {
  describePluginConformance(weatherPlugin);

  const folders: string[] = [];
  afterEach(() => {
    for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
  });

  /** A copy of the weather plugin with `change` applied to its plugin.yaml, and the extra files. */
  function brokenWeather(
    change: (manifest: string) => string,
    files: Record<string, string> = {},
  ): PluginConformanceSubject {
    const folder = mkdtempSync(join(tmpdir(), "halonic-plugin-"));
    folders.push(folder);
    cpSync(weatherFolder, folder, { recursive: true });
    const manifest = join(folder, "plugin.yaml");
    writeFileSync(manifest, change(readFileSync(manifest, "utf8")));
    for (const [path, text] of Object.entries(files)) writeFileSync(join(folder, path), text);
    return { ...weatherPlugin, folder };
  }

  describe("fails a plugin folder that", () => {
    it("has no manifest", () => {
      expect(() => readPluginFolder(join(weatherFolder, "backend"))).toThrow(/has no plugin\.yaml/);
    });

    it("has both plugin.yaml and integration.yaml", () => {
      const subject = brokenWeather((manifest) => manifest, {
        "integration.yaml": "id: weather\n",
      });
      expect(() => checkPluginManifest(subject)).toThrow(/both plugin\.yaml and integration\.yaml/);
    });

    it("breaks its own checks, naming the line", () => {
      const subject = brokenWeather((manifest) =>
        manifest.replace("tool: forecast\n      args", "tool: radar\n      args"),
      );
      expect(() => checkPluginManifest(subject)).toThrow(/plugin\.yaml:\d+:\d+: .*radar/);
    });

    it("is built for another SDK", () => {
      const subject = brokenWeather((manifest) => manifest.replace("sdk: 1", "sdk: 2"));
      expect(() => checkPluginManifest(subject)).toThrow(/SDK 2.* \(at sdk\)/);
    });

    it("names a backend entry that isn't there", () => {
      const subject = brokenWeather((manifest) =>
        manifest.replace("backend/index.ts", "backend/main.js"),
      );
      expect(() => checkPluginManifest(subject)).toThrow(
        /backend\/main\.js is named in the manifest/,
      );
    });

    it("names a local tool script that isn't there", () => {
      const subject = brokenWeather((manifest) =>
        manifest.replace(
          "ui:",
          [
            "localTools:",
            "  - id: files",
            "    start: { script: { program: node, path: tools/files.js } }",
            "    tools:",
            "      - { name: list-files, description: Lists the files., risk: read, untrusted: true }",
            "ui:",
          ].join("\n"),
        ),
      );
      expect(() => checkPluginManifest(subject)).toThrow(
        /tools\/files\.js is named in the manifest/,
      );
    });

    it("declares a backend but gives no code for it", () => {
      const { backend: _backend, ...subject } = weatherPlugin;
      expect(() => checkPluginManifest(subject)).toThrow(/pass the code its entry exports/);
      expect(() => pluginBackendSubject(subject)).toThrow(/pass the code its entry exports/);
    });

    it("has backend code that says a lower risk than its manifest", () => {
      const subject = brokenWeather((manifest) => manifest.replace("risk: write", "risk: read"));
      expect(() => checkPluginManifest(subject)).toThrow(/\(at backend\.tools\.1\.risk\)/);
    });

    it("has backend code that reaches past its host", () => {
      const subject = brokenWeather((manifest) => manifest, {
        "backend/leak.ts": 'export const key = process.env["WEATHER_KEY"];\n',
      });
      expect(() => checkSources(pluginBackendSubject(subject))).toThrow(
        /backend\/leak\.ts:1: process or the environment/,
      );
    });
  });

  it("reads an integration.yaml as a plugin with only a backend", () => {
    const folder = mkdtempSync(join(tmpdir(), "halonic-plugin-"));
    folders.push(folder);
    const manifest = readFileSync(join(weatherFolder, "plugin.yaml"), "utf8");
    const sheet = manifest
      .slice(manifest.indexOf("id:"), manifest.indexOf("ui:"))
      .replace("sdk: 1", "kit: 1\nprovides: [connector]")
      .replace(/^(name|description|backend):.*\n/gm, "")
      .replace(/^ {2}entry: .*\n/m, "")
      .replace(/^ {2}/gm, "");
    writeFileSync(join(folder, "integration.yaml"), sheet);
    const { plugin, manifest: file } = readPluginFolder(folder);
    expect(file).toBe("integration.yaml");
    expect(plugin).toMatchObject({ id: "weather", name: "weather", description: "" });
    expect(plugin.backend?.tools.map((tool) => tool.name)).toEqual(["forecast", "save-favourite"]);
  });

  it("scans every code file beside the backend's entry", () => {
    expect(Object.keys(pluginBackendSubject(weatherPlugin).sources ?? {})).toEqual([
      "backend/index.ts",
    ]);
  });
});
