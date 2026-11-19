import type { Plugin } from "@halonicjs/format";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { localToolConnectorConfig } from "./plugin-local-tool-config.ts";
import type { LocalToolSet } from "./plugin-local-tools.ts";
import type { PluginSettingValues } from "./plugin-settings.ts";
import { pluginFrom } from "./testing/plugin-fixtures.ts";

const grant = { location: "/profile/plugins/weather", fingerprint: "hpf1:test" };

/** The local tool `id` of `plugin`, as the plugin's contributions give it. */
function setOf(plugin: Plugin, id: string): LocalToolSet {
  return { plugin: plugin.id, part: `local:${id}`, declared: [], trust: grant };
}

/** Where a file is in the copy the tests pretend the session made at `/session/plugin`. */
const inCopy = (path: string): string => `/session/plugin/${path}`;

function configOf(plugin: Plugin, id: string, settings: PluginSettingValues) {
  return localToolConnectorConfig({ set: setOf(plugin, id), plugin, settings, inCopy });
}

/** A plugin with one local tool started by a script, and every kind of setting it can take. */
const scriptPlugin = pluginFrom(`id: notes
version: 1.0.0
sdk: 1
name: Notes
localTools:
  - id: server
    start: { script: { program: node, path: server/main.js } }
    args: ["--quiet"]
    env:
      NOTES_ROOT: { setting: root }
      NOTES_LIMIT: { setting: limit }
      NOTES_SYNC: { setting: sync }
      NOTES_LABEL: { setting: label }
    tools:
      - { name: list-notes, description: Lists the notes., risk: read, untrusted: true }
ui:
  settings:
    root: { label: Folder, type: text, required: true }
    limit: { label: Limit, type: number }
    sync: { label: Sync, type: boolean }
    label: { label: Label, type: text }
`);

verifies("app.plugin-local-tool-config", () => {
  describe("a package", () => {
    it("starts the pinned package with the manifest's args, settings, secret names and sites", () => {
      const weather = pluginFrom();
      const config = configOf(weather, "files", { root: "~/Documents" });
      expect(config).toEqual({
        ok: true,
        value: {
          id: "weather:files",
          transport: {
            kind: "stdio",
            command: "npx",
            args: ["-y", "@acme/files-mcp", "--read-only"],
            env: { ACME_ROOT: "~/Documents" },
            sites: ["api.acme.com"],
            pin: {
              registry: "npm",
              registryUrl: "https://registry.npmjs.org",
              package: "@acme/files-mcp",
              version: "3.1.4",
            },
          },
          secretEnv: { ACME_KEY: "plugin__weather__acme-key" },
        },
      });
    });

    it("starts a PyPI package with uvx and its PyPI pin", () => {
      const tool = pluginFrom(`id: sums
version: 1.0.0
sdk: 1
name: Sums
localTools:
  - id: calc
    start:
      package: { runner: uvx, name: acme-sums, version: 0.4.1 }
    tools:
      - { name: add, description: Adds two numbers., risk: read, untrusted: false }
`);
      const config = configOf(tool, "calc", {});
      if (!config.ok) throw new Error("expected a config");
      const transport = config.value.transport;
      expect(transport).toMatchObject({ command: "uvx", args: ["acme-sums"] });
      expect(transport.kind === "stdio" && transport.pin).toEqual({
        registry: "pypi",
        registryUrl: "https://pypi.org",
        package: "acme-sums",
        version: "0.4.1",
      });
    });
  });

  describe("a script", () => {
    it("starts its program with the script's path in the session's copy, and no pin", () => {
      const config = configOf(scriptPlugin, "server", { root: "/notes" });
      if (!config.ok) throw new Error("expected a config");
      expect(config.value.transport).toEqual({
        kind: "stdio",
        command: "node",
        args: ["/session/plugin/server/main.js", "--quiet"],
        env: { NOTES_ROOT: "/notes" },
        sites: [],
      });
      expect(config.value.secretEnv).toEqual({});
    });
  });

  describe("settings", () => {
    it("writes a number and a yes/no as text", () => {
      const config = configOf(scriptPlugin, "server", { root: "/notes", limit: 3, sync: false });
      if (!config.ok) throw new Error("expected a config");
      const transport = config.value.transport;
      expect(transport.kind === "stdio" && transport.env).toEqual({
        NOTES_ROOT: "/notes",
        NOTES_LIMIT: "3",
        NOTES_SYNC: "false",
      });
    });

    it("builds no config when a required setting has no value, and names it", () => {
      expect(configOf(scriptPlugin, "server", { limit: 3 })).toEqual({
        ok: false,
        error: { kind: "settings-not-set", settings: ["root"] },
      });
    });

    it("leaves out the variable of an optional setting with no value", () => {
      const config = configOf(scriptPlugin, "server", { root: "/notes" });
      if (!config.ok) throw new Error("expected a config");
      const transport = config.value.transport;
      expect(transport.kind === "stdio" && Object.keys(transport.env)).toEqual(["NOTES_ROOT"]);
    });
  });

  it("refuses a local tool the plugin doesn't have", () => {
    expect(() => configOf(scriptPlugin, "other", { root: "/notes" })).toThrow(
      'The plugin notes has no local tool "notes:other".',
    );
  });
});
