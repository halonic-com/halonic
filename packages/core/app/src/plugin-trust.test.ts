import type { Clock, Digest } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import type { PluginTrustSubject } from "./plugin-trust.ts";
import { pluginFrom, weatherFiles, weatherManifest } from "./testing/plugin-fixtures.ts";
import { TestTrustStore } from "./testing/test-trust-store.ts";
import { TrustService } from "./trust-service.ts";

/** SHA-256 from Web Crypto, as the platforms' `Digest` adapters give it. */
const digest: Digest = {
  async sha256(data) {
    return new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(data)));
  },
};

const location = "/profile/plugins/weather";

function weather(manifest = weatherManifest, files = weatherFiles): PluginTrustSubject {
  return { location, plugin: pluginFrom(manifest), files };
}

function setup() {
  const store = new TestTrustStore();
  const clock: Clock = { now: () => new Date("2026-11-10T09:00:00.000Z") };
  return { store, service: new TrustService({ store, digest, clock, appVersion: "0.1.0" }) };
}

/** Trusts the weather plugin as a person would: with the fingerprint the check showed. */
async function trusted() {
  const { store, service } = setup();
  const check = await service.checkPlugin(weather());
  const granted = await service.grantPlugin(weather(), check.fingerprint, "prompt");
  expect(granted.ok).toBe(true);
  return { store, service };
}

verifies("app.plugin-trust", () => {
  it("finds a plugin new, with its content and fingerprint and no grant", async () => {
    const { service } = setup();
    const check = await service.checkPlugin(weather());
    expect(check.status).toBe("new");
    expect(check.fingerprint).toMatch(/^hpf1:/u);
    expect(check.content.plugin.id).toBe("weather");
    expect(check).not.toHaveProperty("grant");
  });

  it("trusts it once a person saw the current fingerprint, and saves the pins", async () => {
    const { store, service } = await trusted();
    const check = await service.checkPlugin(weather());
    expect(check.status).toBe("trusted");
    expect(check.status === "trusted" && check.grant).toEqual({
      location,
      fingerprint: check.fingerprint,
    });
    expect(check.status === "trusted" && check.trustedAt).toBe("2026-11-10T09:00:00.000Z");
    expect((await store.get(location))?.pins).toEqual({
      files: {
        registry: "npm",
        registryUrl: "https://registry.npmjs.org",
        package: "@acme/files-mcp",
        version: "3.1.4",
      },
    });
  });

  it("pins a uvx tool to PyPI's base address, and keeps a registry the manifest names", async () => {
    const manifest = weatherManifest
      .replace("version: 3.1.4 }", 'version: 3.1.4, registry: "https://npm.acme.test" }')
      .replace(
        "localTools:\n",
        `localTools:
  - id: notes
    start:
      package: { runner: uvx, name: notes-server, version: 0.4.1 }
    tools:
      - { name: list-notes, description: Lists your notes., risk: read, untrusted: true }
`,
      );
    const { store, service } = setup();
    const check = await service.checkPlugin(weather(manifest));
    const granted = await service.grantPlugin(weather(manifest), check.fingerprint, "prompt");
    expect(granted.ok).toBe(true);
    expect((await store.get(location))?.pins).toEqual({
      files: {
        registry: "npm",
        registryUrl: "https://npm.acme.test",
        package: "@acme/files-mcp",
        version: "3.1.4",
      },
      notes: {
        registry: "pypi",
        registryUrl: "https://pypi.org",
        package: "notes-server",
        version: "0.4.1",
      },
    });
  });

  it("saves nothing when the fingerprint shown isn't the current one", async () => {
    const { store, service } = setup();
    const current = (await service.checkPlugin(weather())).fingerprint;
    const refused = await service.grantPlugin(weather(), current.slice(0, 20), "cli");
    expect(refused).toEqual({
      ok: false,
      error: { kind: "fingerprint-changed", fingerprint: current },
    });
    expect(await store.get(location)).toBeNull();
  });

  it("turns a changed plugin off, with what changed, until a person trusts it again", async () => {
    const { service } = await trusted();
    const changed = weather(weatherManifest.replace("version: 3.1.4", "version: 3.2.0"));
    const check = await service.checkPlugin(changed);
    expect(check.status).toBe("changed");
    if (check.status !== "changed" || !check.changes.readable) throw new Error("expected changes");
    expect(check.changes.localTools.changed.map((tool) => tool.fields)).toEqual([["start"]]);
    expect(check.trustedAt).toBe("2026-11-10T09:00:00.000Z");
  });

  it("never shrinks: a plugin that only lost a file stays off", async () => {
    const { store, service } = await trusted();
    const before = await store.get(location);
    const check = await service.checkPlugin(weather(weatherManifest, weatherFiles.slice(0, 1)));
    expect(check.status).toBe("changed");
    expect(await store.get(location)).toEqual(before);
  });

  it("never takes a workspace record at the same location for the plugin's", async () => {
    const { store, service } = setup();
    await store.grant({
      location,
      fingerprint: "hfp1:0",
      content: { connectors: [] },
      grantedAt: "2026-11-01T00:00:00.000Z",
      appVersion: "0.1.0",
      pins: {},
      origin: "prompt",
    });
    const check = await service.checkPlugin(weather());
    expect(check.status === "changed" && check.changes).toEqual({ readable: false });
  });

  it("isn't trusted when the record can't be read, and gives the store's error", async () => {
    const { store, service } = await trusted();
    store.breakRecords();
    const check = await service.checkPlugin(weather());
    expect(check.status).toBe("unreadable");
    expect(check.status === "unreadable" && String(check.error)).toContain(location);
  });
});
