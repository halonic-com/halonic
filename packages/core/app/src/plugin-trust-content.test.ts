import type { Digest } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { type TrustContent, trustFingerprint } from "@halonicjs/workspace";
import { describe, expect, it } from "vitest";
import {
  pluginTrustContent,
  pluginTrustFingerprint,
  pluginTrustFingerprintPrefix,
} from "./plugin-trust-content.ts";
import { pluginFrom, weatherFiles, weatherManifest } from "./testing/plugin-fixtures.ts";

/** SHA-256 from Web Crypto, as the platforms' `Digest` adapters give it. */
const testDigest: Digest = {
  async sha256(data) {
    return new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(data)));
  },
};

const weather = () => pluginTrustContent({ plugin: pluginFrom(), files: weatherFiles });

/** The fingerprint of the weather plugin with `from` replaced by `to` in its manifest. */
async function fingerprintWith(from: string, to: string): Promise<string> {
  expect(weatherManifest).toContain(from);
  const plugin = pluginFrom(weatherManifest.replace(from, to));
  return await pluginTrustFingerprint(
    pluginTrustContent({ plugin, files: weatherFiles }),
    testDigest,
  );
}

verifies("app.plugin-trust-content", () => {
  describe("what the prompt shows", () => {
    it("lists every host, by part", () => {
      expect(weather().hosts).toEqual([
        { part: "backend", host: "api.example.com" },
        { part: "local:files", host: "api.acme.com" },
      ]);
    });

    it("lists every secret with its purpose and hosts, and how the backend puts it in", () => {
      expect(weather().secrets).toEqual([
        {
          part: "backend",
          name: "example-key",
          purpose: "The forecast service's API key",
          hosts: ["api.example.com"],
          optional: false,
          placement: { as: "header", header: "x-api-key" },
        },
        {
          part: "local:files",
          name: "acme-key",
          purpose: "Reads your Acme account",
          hosts: ["api.acme.com"],
          optional: false,
        },
      ]);
    });

    it("lists every tool with its risk and whether its result is untrusted", () => {
      expect(weather().tools).toEqual([
        { part: "backend", name: "forecast", risk: "read", untrusted: true },
        { part: "backend", name: "post-report", risk: "send", untrusted: false },
        { part: "local:files", name: "list-files", risk: "read", untrusted: true },
      ]);
    });

    it("lists each local program with its pin, arguments, environment, network and time limit", () => {
      expect(weather().localTools).toEqual([
        {
          id: "files",
          start: { runner: "npx", name: "@acme/files-mcp", version: "3.1.4" },
          args: ["--read-only"],
          env: { ACME_ROOT: { setting: "root" }, ACME_KEY: { secret: "acme-key" } },
          network: ["api.acme.com"],
          callTimeoutMs: 60_000,
        },
      ]);
    });

    it("keeps the plugin's identity, the whole manifest and every file, sorted by path", () => {
      const content = weather();
      expect(content.plugin).toEqual({ id: "weather", version: "1.2.0", sdk: 1, name: "Weather" });
      expect(content.manifest).toEqual(pluginFrom());
      expect(content.files.map((file) => file.path)).toEqual(["backend/index.js", "plugin.yaml"]);
    });

    it("leaves out the backend of a plugin with only local tools", () => {
      const onlyLocal = weatherManifest
        .replace(/^backend:[\s\S]*?(?=^localTools:)/mu, "")
        .replace(/^ {2}commands:[\s\S]*$/mu, "");
      const content = pluginTrustContent({ plugin: pluginFrom(onlyLocal), files: [] });
      expect(content.hosts).toEqual([{ part: "local:files", host: "api.acme.com" }]);
      expect(content.secrets.map((secret) => secret.part)).toEqual(["local:files"]);
      expect(content.tools.map((tool) => tool.part)).toEqual(["local:files"]);
    });
  });

  describe("the fingerprint", () => {
    it("is hpf1: and a SHA-256, never a workspace fingerprint", async () => {
      const fingerprint = await pluginTrustFingerprint(weather(), testDigest);
      expect(pluginTrustFingerprintPrefix).toBe("hpf1:");
      expect(fingerprint).toMatch(/^hpf1:[0-9a-f]{64}$/u);
    });

    it("encodes the content as the workspace fingerprint does", async () => {
      const content = weather();
      const plugin = await pluginTrustFingerprint(content, testDigest);
      const workspace = await trustFingerprint(content as unknown as TrustContent, testDigest);
      expect(plugin.slice("hpf1:".length)).toBe(workspace.slice("hfp1:".length));
    });

    it("is the same whatever order the files were hashed in", async () => {
      const reversed = pluginTrustContent({
        plugin: pluginFrom(),
        files: [...weatherFiles].reverse(),
      });
      expect(await pluginTrustFingerprint(reversed, testDigest)).toBe(
        await pluginTrustFingerprint(weather(), testDigest),
      );
    });

    it("changes with any file's bytes", async () => {
      const files = weatherFiles.map((file) =>
        file.path === "backend/index.js" ? { ...file, sha256: "c".repeat(64) } : file,
      );
      const changed = pluginTrustContent({ plugin: pluginFrom(), files });
      expect(await pluginTrustFingerprint(changed, testDigest)).not.toBe(
        await pluginTrustFingerprint(weather(), testDigest),
      );
    });

    it("changes with a pin, a risk, and a field the prompt doesn't list", async () => {
      const original = await pluginTrustFingerprint(weather(), testDigest);
      expect(await fingerprintWith("version: 3.1.4", "version: 3.1.5")).not.toBe(original);
      expect(await fingerprintWith("risk: send", "risk: write")).not.toBe(original);
      expect(await fingerprintWith("Forecasts for the places", "Forecasts for places")).not.toBe(
        original,
      );
      expect(await fingerprintWith("label: Folder", "label: Your folder")).not.toBe(original);
    });
  });
});
