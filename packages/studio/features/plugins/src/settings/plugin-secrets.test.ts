import { type Plugin, parseFile } from "@halonicjs/format";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import {
  forgetPlugin,
  type PluginSecretWriter,
  type PluginSettingProblem,
  type PluginSettingsHost,
  savePluginSettings,
} from "./plugin-secrets.ts";

const weather = pluginFrom(`id: weather
version: 1.2.0
sdk: 1
name: Weather
backend:
  hosts: [api.example.com]
  secrets:
    weather-key:
      purpose: The forecast service's API key
      hosts: [api.example.com]
      as: header
      header: x-api-key
  tools:
    - { name: forecast, description: The forecast for one place., risk: read, untrusted: true }
localTools:
  - id: files
    start: { script: { program: node, path: server.js } }
    secrets:
      acme-key: { purpose: Reads your Acme account, hosts: [api.acme.com] }
    network: [api.acme.com]
    tools:
      - { name: list-files, description: Lists the files in a folder., risk: read, untrusted: true }
ui:
  settings:
    city: { label: City, type: text, required: true }
    key: { label: API key, type: secret, secret: weather-key }
`);

function pluginFrom(manifest: string): Plugin {
  const parsed = parseFile("plugin", manifest);
  if (!parsed.ok) throw new Error(parsed.error.map((problem) => problem.message).join("; "));
  return parsed.value.value;
}

/** A host like `PluginService`: secret names as `plugin__<id>__<secret>`. */
function fakeHost(problems: readonly PluginSettingProblem[] = []) {
  const saved: Record<string, unknown>[] = [];
  const forgotten: string[] = [];
  const host: PluginSettingsHost = {
    saveSettings: async (_plugin, values) => {
      if (problems.length > 0) return { ok: false, error: problems };
      saved.push({ ...values });
      return { ok: true };
    },
    secretNames: () => ({
      "weather-key": "plugin__weather__weather-key",
      "acme-key": "plugin__weather__acme-key",
    }),
    forget: async (id) => {
      forgotten.push(id);
    },
  };
  return { host, saved, forgotten };
}

function fakeWriter(failing: readonly string[] = []) {
  const stored = new Map<string, string>();
  const removed: string[] = [];
  const writer: PluginSecretWriter = {
    set: async (name, value) => {
      if (failing.includes(name)) throw new Error("The keychain is locked.");
      stored.set(name, value);
    },
    remove: async (name) => {
      if (failing.includes(name)) throw new Error("The keychain is locked.");
      removed.push(name);
      stored.delete(name);
    },
  };
  return { writer, stored, removed };
}

verifies("plugins.plugin-secrets", () => {
  describe("savePluginSettings", () => {
    it("saves a secret under the plugin's own name, never the name it declares", async () => {
      const { host, saved } = fakeHost();
      const { writer, stored } = fakeWriter();
      const outcome = await savePluginSettings(host, writer, weather, { city: "Oslo", key: "abc" });
      expect(outcome).toEqual({ kind: "saved", failed: [] });
      expect([...stored]).toEqual([["plugin__weather__weather-key", "abc"]]);
      expect(stored.has("weather-key")).toBe(false);
      expect(saved).toEqual([{ city: "Oslo" }]);
    });

    it("keeps the stored secret when its field is left empty", async () => {
      const { host } = fakeHost();
      const { writer, stored } = fakeWriter();
      await savePluginSettings(host, writer, weather, { city: "Oslo", key: "" });
      expect(stored.size).toBe(0);
    });

    it("writes no secret when the other settings don't fit", async () => {
      const problems = [{ setting: "city", message: "fill this in: it is required" }];
      const { host } = fakeHost(problems);
      const { writer, stored } = fakeWriter();
      const outcome = await savePluginSettings(host, writer, weather, { key: "abc" });
      expect(outcome).toEqual({ kind: "refused", problems });
      expect(stored.size).toBe(0);
    });

    it("names a secret the writer couldn't save", async () => {
      const { host } = fakeHost();
      const { writer } = fakeWriter(["plugin__weather__weather-key"]);
      const outcome = await savePluginSettings(host, writer, weather, { city: "Oslo", key: "abc" });
      expect(outcome).toMatchObject({ kind: "saved", failed: [{ secret: "weather-key" }] });
    });

    it("passes a value named like a secret, but not declared as one, to the host to check", async () => {
      const { host, saved } = fakeHost();
      const { writer, stored } = fakeWriter();
      await savePluginSettings(host, writer, weather, { city: "Oslo", "weather-key": "abc" });
      expect(saved).toEqual([{ city: "Oslo", "weather-key": "abc" }]);
      expect(stored.size).toBe(0);
    });
  });

  describe("forgetPlugin", () => {
    it("deletes every secret under the plugin's own names, then its settings", async () => {
      const { host, forgotten } = fakeHost();
      const { writer, removed } = fakeWriter();
      expect(await forgetPlugin(host, writer, weather)).toEqual([]);
      expect(removed).toEqual(["plugin__weather__weather-key", "plugin__weather__acme-key"]);
      expect(forgotten).toEqual(["weather"]);
    });

    it("still deletes the rest, and names the secret it couldn't delete", async () => {
      const { host, forgotten } = fakeHost();
      const { writer, removed } = fakeWriter(["plugin__weather__weather-key"]);
      const failed = await forgetPlugin(host, writer, weather);
      expect(failed.map((failure) => failure.secret)).toEqual(["weather-key"]);
      expect(removed).toEqual(["plugin__weather__acme-key"]);
      expect(forgotten).toEqual(["weather"]);
    });
  });
});
