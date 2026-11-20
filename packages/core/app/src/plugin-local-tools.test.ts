import type { ConnectorFactoryContext } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import {
  backend,
  clock,
  config,
  digest,
  filesFolder,
  lister,
  profileNumber,
  setUp,
  TestFactory,
  TestSandbox,
  trust,
  trustedAsLoaded,
} from "./local-tool-fixtures.spec.ts";
import { readPluginFolder } from "./plugin-folder.ts";
import {
  isLocalToolSet,
  type LocalToolMxc,
  type LocalToolSet,
  LocalToolUnavailableError,
  localToolConnectorId,
  PluginLocalToolNotTrustedError,
  PluginLocalTools,
} from "./plugin-local-tools.ts";
import { TestTrustStore } from "./testing/test-trust-store.ts";
import { TrustService } from "./trust-service.ts";

verifies("app.plugin-local-tools", () => {
  it("tells local tools from the backend, and names each one's connector", () => {
    expect(isLocalToolSet(lister)).toBe(true);
    expect(isLocalToolSet(backend)).toBe(false);
    expect(localToolConnectorId(lister)).toBe("files:lister");
  });

  it("on a host with no sandbox, loads the local tool and says it needs the desktop app", async () => {
    const { local } = setUp(null);
    expect(await local.state()).toEqual({ kind: "needs-desktop-app" });
    const connector = local.connector(lister);
    expect(connector.id).toBe("files:lister");
    const refused = connector.callTool("list-files", {});
    await expect(refused).rejects.toThrow(LocalToolUnavailableError);
    await expect(refused).rejects.toMatchObject({ state: { kind: "needs-desktop-app" } });
    await expect(connector.listTools()).rejects.toThrow("it needs the desktop app");
    await connector.close();
  });

  it("where the sandbox can't start, says why with its reason, and opens nothing", async () => {
    const sandbox = new TestSandbox();
    sandbox.checkResult = {
      ok: false,
      reason: "bubblewrap-missing",
      missing: ["bubblewrap is not installed"],
    };
    const { local, factory } = setUp(sandbox);
    expect(await local.state()).toEqual({
      kind: "sandbox-unavailable",
      reason: "bubblewrap-missing",
    });
    await expect(local.connector(lister).callTool("list-files", {})).rejects.toMatchObject({
      state: { kind: "sandbox-unavailable", reason: "bubblewrap-missing" },
    });
    expect(factory.contexts).toEqual([]);
  });

  it.each([
    { fence: { state: "off" }, code: "off" },
    { fence: { state: "not-fenced", reason: "a probe got through" }, code: "not-fenced" },
    { fence: { state: "stopped" }, code: "stopped" },
  ] as const)(
    "refuses a session whose fence is $code: closes it and creates no connector",
    async ({ fence, code }) => {
      const sandbox = new TestSandbox();
      sandbox.fence = fence;
      const { local, factory } = setUp(sandbox);
      const refused = local.connector(lister).callTool("list-files", {});
      await expect(refused).rejects.toThrow(LocalToolUnavailableError);
      await expect(refused).rejects.toMatchObject({
        state: { kind: "sandbox-not-fenced", fence: code },
      });
      expect(factory.contexts).toEqual([]);
      expect(sandbox.sessions).toHaveLength(1);
      expect(sandbox.sessions[0]?.fence).toEqual({ state: "stopped" });
    },
  );

  it("opens one session on the first call, with the plugin's grant, and keeps it", async () => {
    const { local, factory, sandbox } = setUp();
    expect(await local.state()).toEqual({ kind: "ready" });
    const connector = local.connector(lister);
    expect(sandbox?.sessions).toEqual([]);
    expect(await connector.callTool("list-files", {})).toBe("/data/local-tools/files-lister-1");
    expect(await connector.callTool("list-files", {})).toBe("/data/local-tools/files-lister-1");
    expect(sandbox?.sessions).toHaveLength(1);
    expect(factory.contexts[0]?.trust).toEqual(trust);
    expect(factory.contexts[0]?.sandbox).toBe(sandbox?.sessions[0]);
  });

  it("when the session ends during a call, fails that call, then opens a new session on the next one", async () => {
    const { local, factory, sandbox } = setUp();
    const connector = local.connector(lister);
    await expect(connector.callTool("outlast", {})).rejects.toThrow("has ended");
    expect(factory.closed).toBe(1);
    expect(await connector.callTool("list-files", {})).toBe("/data/local-tools/files-lister-2");
    expect(sandbox?.sessions).toHaveLength(2);
  });

  it("opens a new session when the last one ended between calls", async () => {
    const { local, sandbox } = setUp();
    const connector = local.connector(lister);
    await connector.callTool("list-files", {});
    await sandbox?.sessions[0]?.close();
    expect(await connector.callTool("list-files", {})).toBe("/data/local-tools/files-lister-2");
  });

  it("closes its connector and its session when it is closed, and opens nothing after", async () => {
    const { local, factory, sandbox } = setUp();
    const connector = local.connector(lister);
    await connector.callTool("list-files", {});
    await connector.close();
    await connector.close();
    expect(factory.closed).toBe(1);
    expect(sandbox?.sessions[0]?.fence).toEqual({ state: "stopped" });
    await expect(connector.callTool("list-files", {})).rejects.toThrow("is closed");
    expect(sandbox?.sessions).toHaveLength(1);
  });

  it("still closes the session when closing its connector throws", async () => {
    const { local, factory, sandbox } = setUp();
    const connector = local.connector(lister);
    await connector.callTool("list-files", {});
    factory.closeFails = true;
    await expect(connector.close()).rejects.toThrow("didn't close");
    expect(factory.closed).toBe(1);
    expect(sandbox?.sessions[0]?.fence).toEqual({ state: "stopped" });
  });

  it("refuses a local tool the host prepared under another connector id", async () => {
    const sandbox = new TestSandbox();
    const local = new PluginLocalTools({
      sandbox,
      factory: new TestFactory(),
      context: {} as Omit<ConnectorFactoryContext, "trust" | "sandbox">,
      startTrust: trustedAsLoaded(),
      prepare: async () => ({ config: { ...config, id: "other" }, profile: profileNumber(1) }),
    });
    await expect(local.connector(lister).listTools()).rejects.toThrow(
      'was prepared as connector "other"',
    );
    expect(sandbox.sessions).toEqual([]);
  });

  describe("on MXC", () => {
    function mxcOf(options: { inUse?: boolean; fences?: boolean } = {}) {
      const sandbox = new TestSandbox();
      const mxc: LocalToolMxc = {
        sandbox,
        inUse: () => options.inUse ?? true,
        ...(options.fences === undefined ? {} : { fences: options.fences }),
      };
      return { sandbox, mxc };
    }

    it("runs a local tool that declares no network in MXC, with the fence proof checked as for any sandbox", async () => {
      const { sandbox: mxcSandbox, mxc } = mxcOf({ fences: true });
      const { local, sandbox } = setUp(new TestSandbox(), { mxc });
      expect(await local.connector(lister).callTool("list-files", {})).toBe(
        "/data/local-tools/files-lister-1",
      );
      expect(mxcSandbox.sessions).toHaveLength(1);
      expect(sandbox?.sessions).toEqual([]);
    });

    it("refuses a local tool that declares a network, before MXC's open, and starts nothing", async () => {
      const { sandbox: mxcSandbox, mxc } = mxcOf({ fences: true });
      const { local, factory } = setUp(new TestSandbox(), { mxc, sites: ["api.example.com"] });
      const refused = local.connector(lister).callTool("list-files", {});
      await expect(refused).rejects.toThrow(LocalToolUnavailableError);
      await expect(refused).rejects.toMatchObject({ state: { kind: "network-needs-srt" } });
      expect(mxcSandbox.sessions).toEqual([]);
      expect(factory.contexts).toEqual([]);
    });

    it("counts a bridge as a network too: no network on MXC means no bridge and no site", async () => {
      const { sandbox: mxcSandbox, mxc } = mxcOf({ fences: true });
      const factory = new TestFactory();
      const local = new PluginLocalTools({
        sandbox: new TestSandbox(),
        mxc,
        factory,
        context: {} as Omit<ConnectorFactoryContext, "trust" | "sandbox">,
        startTrust: trustedAsLoaded(),
        prepare: async () => {
          const profile = profileNumber(1);
          const bridge = { kind: "loopback", host: "127.0.0.1", port: 41817 } as const;
          return { config, profile: { ...profile, network: { ...profile.network, bridge } } };
        },
      });
      const refused = local.connector(lister).callTool("list-files", {});
      await expect(refused).rejects.toMatchObject({ state: { kind: "network-needs-srt" } });
      expect(mxcSandbox.sessions).toEqual([]);
      expect(factory.contexts).toEqual([]);
    });

    it("stays off while MXC doesn't count as a fence, as the switch ships", async () => {
      const { sandbox: mxcSandbox, mxc } = mxcOf();
      const { local, sandbox } = setUp(new TestSandbox(), { mxc, sites: ["api.example.com"] });
      await local.connector(lister).callTool("list-files", {});
      expect(mxcSandbox.sessions).toEqual([]);
      expect(sandbox?.sessions).toHaveLength(1);
    });

    it("leaves the host's sandbox alone while the sandbox choice doesn't have MXC in use", async () => {
      const { sandbox: mxcSandbox, mxc } = mxcOf({ inUse: false, fences: true });
      const { local, sandbox } = setUp(new TestSandbox(), { mxc, sites: ["api.example.com"] });
      await local.connector(lister).callTool("list-files", {});
      expect(mxcSandbox.sessions).toEqual([]);
      expect(sandbox?.sessions).toHaveLength(1);
    });

    it("still refuses a session whose fence is not proven", async () => {
      const { sandbox: mxcSandbox, mxc } = mxcOf({ fences: true });
      mxcSandbox.fence = { state: "not-fenced", reason: "a probe got through" };
      const { local } = setUp(new TestSandbox(), { mxc });
      await expect(local.connector(lister).callTool("list-files", {})).rejects.toMatchObject({
        state: { kind: "sandbox-not-fenced", fence: "not-fenced" },
      });
    });
  });

  describe("checks the plugin's trust again before every session", () => {
    /** The `files` plugin in a real trust service, trusted as a person would. */
    async function trusted() {
      const plugins = filesFolder();
      const service = new TrustService({
        store: new TestTrustStore(),
        digest,
        clock,
        appVersion: "0.1.0",
      });
      const read = await readPluginFolder(plugins, digest, "files");
      if (!read.ok) throw new Error(JSON.stringify(read.error));
      const shown = await service.checkPlugin(read.value);
      expect((await service.grantPlugin(read.value, shown.fingerprint, "cli")).ok).toBe(true);
      const grant = { location: read.value.location, fingerprint: shown.fingerprint };
      const set: LocalToolSet = { ...lister, trust: grant };
      return { plugins, service, set, startTrust: { plugins, digest, trust: service } };
    }

    async function notTrusted(promise: Promise<unknown>): Promise<PluginLocalToolNotTrustedError> {
      const error = await promise.then(
        () => undefined,
        (thrown: unknown) => thrown,
      );
      expect(error).toBeInstanceOf(PluginLocalToolNotTrustedError);
      return error as PluginLocalToolNotTrustedError;
    }

    it("opens the session when the plugin is trusted as it is now", async () => {
      const { set, startTrust } = await trusted();
      const sandbox = new TestSandbox();
      const { local } = setUp(sandbox, { startTrust });
      await local.connector(set).callTool("list-files", {});
      expect(sandbox.sessions).toHaveLength(1);
    });

    it("opens nothing when the script changed after the plugin loaded", async () => {
      const { plugins, set, startTrust } = await trusted();
      const sandbox = new TestSandbox();
      const { local, factory } = setUp(sandbox, { startTrust });
      plugins.putFiles({ "files/tools/server.js": "console.log('changed');\n" });
      const error = await notTrusted(local.connector(set).callTool("list-files", {}));
      expect(error.reason).toBe("changed");
      expect(error.message).toContain("halonic trust --plugin files");
      expect(sandbox.sessions).toEqual([]);
      expect(factory.contexts).toEqual([]);
    });

    it("checks again for the session after one ended, not only for the first", async () => {
      const { plugins, set, startTrust } = await trusted();
      const sandbox = new TestSandbox();
      const { local } = setUp(sandbox, { startTrust });
      const connector = local.connector(set);
      await expect(connector.callTool("outlast", {})).rejects.toThrow();
      plugins.putFiles({ "files/tools/server.js": "console.log('changed');\n" });
      expect((await notTrusted(connector.callTool("list-files", {}))).reason).toBe("changed");
      expect(sandbox.sessions).toHaveLength(1);
    });

    it("opens nothing once the person took the trust back", async () => {
      const { service, set, startTrust } = await trusted();
      const sandbox = new TestSandbox();
      const { local } = setUp(sandbox, { startTrust });
      await service.revoke(set.trust.location);
      const error = await notTrusted(local.connector(set).callTool("list-files", {}));
      expect(error.reason).toBe("not-trusted");
      expect(sandbox.sessions).toEqual([]);
    });

    it("opens nothing when the plugin was trusted again since it loaded", async () => {
      const sandbox = new TestSandbox();
      const { local } = setUp(sandbox);
      const loadedEarlier = { ...lister, trust: { ...trust, fingerprint: "hfp1:earlier" } };
      const error = await notTrusted(local.connector(loadedEarlier).callTool("list-files", {}));
      expect(error.reason).toBe("changed");
      expect(sandbox.sessions).toEqual([]);
    });

    it("hands the plugin as it was checked to prepare", async () => {
      const { set, startTrust } = await trusted();
      const handed: string[] = [];
      const local = new PluginLocalTools({
        sandbox: new TestSandbox(),
        factory: new TestFactory(),
        context: {} as Omit<ConnectorFactoryContext, "trust" | "sandbox">,
        startTrust,
        prepare: async (_set, checked) => {
          handed.push(checked.fingerprint, ...checked.files.map((file) => file.path));
          return { config, profile: profileNumber(1) };
        },
      });
      await local.connector(set).callTool("list-files", {});
      expect(handed[0]).toBe(set.trust.fingerprint);
      expect(handed).toContain("tools/server.js");
    });
  });
});
