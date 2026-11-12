import type { Clock, Digest, Sandbox, SandboxCheck, SandboxFence } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it, vi } from "vitest";
import {
  PluginBackendNotTrustedError,
  PluginBackendStart,
  PluginSecretNameMissingError,
  pluginBackendChoices,
  type TrustedPluginBackend,
} from "./plugin-backend.ts";
import { readPluginFolder } from "./plugin-folder.ts";
import { type GatedRunner, RunnerStartGate } from "./runner-start-gate.ts";
import { pluginFrom } from "./testing/plugin-fixtures.ts";
import { TestFolderReader } from "./testing/test-folder-reader.ts";
import { TestTrustStore } from "./testing/test-trust-store.ts";
import { TestUnfencedRunConsentStore } from "./testing/test-unfenced-run-consent-store.ts";
import { TrustService } from "./trust-service.ts";
import { UnfencedRuns } from "./unfenced-runs.ts";

/** SHA-256 from Web Crypto, as the platforms' `Digest` adapters give it. */
const digest: Digest = {
  async sha256(data) {
    return new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(data)));
  },
};

const clock: Clock = { now: () => new Date("2026-11-12T07:00:00.000Z") };

const passes: SandboxCheck = { ok: true, reason: null, missing: [] };
const inContainer: SandboxCheck = { ok: false, reason: "container", missing: [] };

const rainManifest = `id: rain
version: 0.3.0
sdk: 1
name: Rain
description: The rain radar.
backend:
  hosts: [radar.example.com]
  secrets:
    radar-key:
      purpose: The radar's API key
      hosts: [radar.example.com]
      as: bearer
  tools:
    - { name: radar-map, description: The rain radar., risk: read, untrusted: true }
ui:
  settings:
    units: { label: Units, type: text, default: metric }
    key: { label: Key, type: secret, secret: radar-key }
`;

const toolsOnlyManifest = `id: files-only
version: 1.0.0
sdk: 1
name: Files only
description: A local tool and nothing else.
localTools:
  - id: files
    start:
      package: { runner: npx, name: "@acme/files-mcp", version: 3.1.4 }
    tools:
      - { name: list-files, description: Lists the files in a folder., risk: read, untrusted: true }
`;

/** A sandbox the gate only checks and hands on; the start itself is faked. */
function sandbox(name: string, check: SandboxCheck = passes): Sandbox & { name: string } {
  return {
    name,
    check: async () => check,
    capabilities: () => ({ files: "shared", strength: name === "launcher" ? "none" : "os" }),
    open: async () => {
      throw new Error("the gate never opens a session itself");
    },
  };
}

class FakeRunner implements GatedRunner {
  readonly stopped = new Promise<void>(() => {});
  readonly startedIn: string;
  readonly fence: SandboxFence;

  constructor(startedIn: string) {
    this.startedIn = startedIn;
    this.fence = startedIn === "fenced" ? { state: "fenced" } : { state: "off" };
  }

  async close(): Promise<void> {}
}

interface SetupOptions {
  readonly check?: SandboxCheck;
  readonly platform?: string;
  readonly manifest?: string;
}

async function setup({
  check = passes,
  platform = "linux",
  manifest = rainManifest,
}: SetupOptions = {}) {
  const id = manifest === toolsOnlyManifest ? "files-only" : "rain";
  const plugins = new TestFolderReader().putFiles({
    [`${id}/plugin.yaml`]: manifest,
    [`${id}/backend/index.js`]: "export default {};\n",
  });
  const store = new TestTrustStore();
  const trust = new TrustService({
    store,
    digest,
    clock,
    appVersion: "0.1.0",
  });
  const runs = new UnfencedRuns({ store: new TestUnfencedRunConsentStore(), clock });
  const gate = new RunnerStartGate({
    platform,
    fenced: sandbox("fenced", check),
    launcher: sandbox("launcher"),
    runs,
  });
  const starts = new PluginBackendStart({ plugins, digest, trust, gate });
  const started: FakeRunner[] = [];
  const startIn = async (picked: Sandbox, _trusted?: TrustedPluginBackend) => {
    const runner = new FakeRunner((picked as Sandbox & { name: string }).name);
    started.push(runner);
    return runner;
  };

  /** The plugin as the service reads it now. */
  const read = async () => {
    const found = await readPluginFolder(plugins, digest, id);
    if (!found.ok) throw new Error(JSON.stringify(found.error));
    return found.value;
  };

  /** Trusts the plugin as a person would. */
  const trustIt = async () => {
    const subject = await read();
    const shown = await trust.checkPlugin(subject);
    expect((await trust.grantPlugin(subject, shown.fingerprint, "cli")).ok).toBe(true);
  };

  return { id, plugins, digest, gate, store, trust, runs, starts, started, startIn, read, trustIt };
}

async function refusal(promise: Promise<unknown>): Promise<PluginBackendNotTrustedError> {
  const error = await promise.then(
    () => undefined,
    (thrown: unknown) => thrown,
  );
  expect(error).toBeInstanceOf(PluginBackendNotTrustedError);
  return error as PluginBackendNotTrustedError;
}

verifies("app.plugin-backend", () => {
  describe("PluginBackendStart", () => {
    it("starts the backend through the gate when the plugin is trusted as it is", async () => {
      const { id, starts, started, startIn, trustIt } = await setup();
      await trustIt();
      expect((await starts.start(id, startIn)).run).toBe("fenced");
      expect(started.map((runner) => runner.startedIn)).toEqual(["fenced"]);
    });

    it("hands the checked plugin, its files and fingerprint to the start", async () => {
      const { id, starts, read, trust, trustIt } = await setup();
      await trustIt();
      const handed: TrustedPluginBackend[] = [];
      await starts.start(id, async (_sandbox, trusted) => {
        handed.push(trusted);
        return new FakeRunner("fenced");
      });
      const subject = await read();
      expect(handed).toEqual([
        { ...subject, fingerprint: (await trust.checkPlugin(subject)).fingerprint },
      ]);
      expect(handed[0]?.files.map((file) => file.path)).toContain("backend/index.js");
    });

    it("starts no process for a plugin nobody trusted", async () => {
      const { id, starts, started, startIn } = await setup();
      expect((await refusal(starts.start(id, startIn))).reason).toBe("not-trusted");
      expect(started).toEqual([]);
    });

    it("starts nothing once the person took the trust back", async () => {
      const { id, plugins, trust, starts, started, startIn, trustIt } = await setup();
      await trustIt();
      await trust.revoke((await plugins.locationOf(id)) ?? "");
      expect((await refusal(starts.start(id, startIn))).reason).toBe("not-trusted");
      expect(started).toEqual([]);
    });

    it("starts nothing when a byte of the backend's code changed since the trust", async () => {
      const { id, plugins, starts, started, startIn, trustIt } = await setup();
      await trustIt();
      plugins.putFiles({ [`${id}/backend/index.js`]: "export default {};\r" });
      expect((await refusal(starts.start(id, startIn))).reason).toBe("changed");
      expect(started).toEqual([]);
    });

    it("checks the plugin again at every start, such as the restart after an idle stop", async () => {
      const { id, plugins, starts, started, startIn, trustIt } = await setup();
      await trustIt();
      expect((await starts.start(id, startIn)).run).toBe("fenced");
      plugins.putFiles({ [`${id}/backend/extra.js`]: "" });
      expect((await refusal(starts.start(id, startIn))).reason).toBe("changed");
      expect(started).toHaveLength(1);
    });

    it("starts nothing when a link appeared in the plugin folder since the trust", async () => {
      const { id, plugins, starts, started, startIn, trustIt } = await setup();
      await trustIt();
      plugins.putLink(`${id}/backend/keys`);
      const error = await refusal(starts.start(id, startIn));
      expect(error.reason).toBe("unreadable");
      expect(error.problems).toEqual([expect.objectContaining({ code: "link" })]);
      expect(started).toEqual([]);
    });

    it("starts nothing when the folder can't be read at all", async () => {
      const { id, plugins, starts, started, startIn, trustIt } = await setup();
      await trustIt();
      vi.spyOn(plugins, "entries").mockRejectedValue(new Error("disk gone"));
      const error = await refusal(starts.start(id, startIn));
      expect(error.reason).toBe("unreadable");
      expect(error.problems).toEqual([
        expect.objectContaining({
          code: "read-failed",
          message: expect.stringContaining("disk gone"),
        }),
      ]);
      expect(started).toEqual([]);
    });

    it("starts nothing when the trust record can't be read", async () => {
      const { id, store, starts, started, startIn, trustIt } = await setup();
      await trustIt();
      store.breakRecords();
      expect((await refusal(starts.start(id, startIn))).reason).toBe("record-unreadable");
      expect(started).toEqual([]);
    });

    it("tells the person what to do next in every trust refusal", async () => {
      const { id, store, starts, startIn, trustIt } = await setup();
      expect((await refusal(starts.start(id, startIn))).message).toContain(
        `halonic trust --plugin ${id}`,
      );
      await trustIt();
      store.breakRecords();
      expect((await refusal(starts.start(id, startIn))).message).toContain(
        `halonic trust --plugin ${id}`,
      );
    });

    it("refuses a status it doesn't know without telling the person to trust the plugin", async () => {
      const { id, plugins, digest: hashes, gate, started, startIn } = await setup();
      const starts = new PluginBackendStart({
        plugins,
        digest: hashes,
        gate,
        trust: { checkPlugin: async () => ({ status: "from-a-later-version" }) as never },
      });
      const error = await refusal(starts.start(id, startIn));
      expect(error.reason).toBe("not-checked");
      expect(error.message).not.toContain("trust --plugin");
      expect(started).toEqual([]);
    });

    it("has nothing to start for a plugin with only local tools", async () => {
      const { id, starts, started, startIn, trustIt } = await setup({
        manifest: toolsOnlyManifest,
      });
      await trustIt();
      expect((await refusal(starts.start(id, startIn))).reason).toBe("no-backend");
      expect(started).toEqual([]);
    });

    it("refuses an id that isn't one folder name", async () => {
      const { starts, startIn } = await setup();
      await expect(starts.start("../rain", startIn)).rejects.toBeInstanceOf(RangeError);
    });

    it("reads the saved yes at every start: it is never kept from install time (a)", async () => {
      const { id, runs, starts, started, startIn, trustIt } = await setup({ check: inContainer });
      await trustIt();
      expect(await starts.start(id, startIn)).toEqual({ run: "needs-yes", reason: "container" });
      await runs.allow("container");
      expect((await starts.start(id, startIn)).run).toBe("unfenced");
      await runs.takeBack();
      expect(await starts.start(id, startIn)).toEqual({ run: "needs-yes", reason: "container" });
      expect(started.map((runner) => runner.startedIn)).toEqual(["launcher"]);
    });

    it("never takes a saved yes for trust", async () => {
      const { id, runs, starts, started, startIn } = await setup({ check: inContainer });
      await runs.allow("container");
      expect((await refusal(starts.start(id, startIn))).reason).toBe("not-trusted");
      expect(started).toEqual([]);
    });

    it("is always not-fenced with windows on Windows, even when the sandbox check passes (b)", async () => {
      const { id, runs, starts, started, startIn, trustIt } = await setup({ platform: "win32" });
      await trustIt();
      expect(await starts.start(id, startIn)).toEqual({ run: "needs-yes", reason: "windows" });
      expect(started).toEqual([]);
      await runs.allow("windows");
      expect((await starts.start(id, startIn)).run).toBe("unfenced");
      expect(started.map((runner) => runner.startedIn)).toEqual(["launcher"]);
    });
  });

  describe("pluginBackendChoices", () => {
    it("gives the setting values and where the backend's secrets are stored", () => {
      const plugin = pluginFrom(rainManifest);
      expect(pluginBackendChoices(plugin, { units: "metric" })).toEqual({
        settings: { units: "metric" },
        secretNames: { "radar-key": "plugin__rain__radar-key" },
      });
    });

    it("leaves a local tool's secret out", () => {
      const plugin = pluginFrom(
        rainManifest.replace(
          "ui:",
          `localTools:
  - id: files
    start:
      package: { runner: npx, name: "@acme/files-mcp", version: 3.1.4 }
    secrets:
      acme-key: { purpose: Reads your Acme account, hosts: [api.acme.com] }
    network: [api.acme.com]
    tools:
      - { name: list-files, description: Lists the files in a folder., risk: read, untrusted: true }
ui:`,
        ),
      );
      expect(Object.keys(pluginBackendChoices(plugin, {}).secretNames)).toEqual(["radar-key"]);
    });

    it("says a secret without a stored name is Halonic's bug, by key", () => {
      const error = new PluginSecretNameMissingError("Weather", "radar-key");
      expect(error.key).toBe("plugin-secret-name-missing");
      expect(error.plugin).toBe("Weather");
      expect(error.secret).toBe("radar-key");
      expect(error.message).toBe(
        "Halonic can't find where the plugin Weather stores its secret radar-key. This is a bug in Halonic, not something you did.",
      );
    });
  });
});
