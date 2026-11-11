import type {
  ConnectorClient,
  ConnectorConfig,
  ConnectorFactory,
  ConnectorFactoryContext,
  Sandbox,
  SandboxCheck,
  SandboxFence,
  SandboxProfile,
} from "@halonicjs/ports";
import { FakeSandboxSession, idleProgram } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import type { PluginToolSet } from "./plugin-contributions.ts";
import {
  isLocalToolSet,
  type LocalToolSet,
  LocalToolUnavailableError,
  localToolConnectorId,
  PluginLocalTools,
} from "./plugin-local-tools.ts";

const trust = { location: "/profile/plugins/files", fingerprint: "hfp1:files" };

const lister: LocalToolSet = {
  plugin: "files",
  part: "local:lister",
  declared: [
    { name: "list-files", description: "Lists the files.", risk: "read", untrusted: true },
  ],
  trust,
};

const backend: PluginToolSet = { ...lister, part: "backend" };

const config: ConnectorConfig = {
  id: "files:lister",
  transport: { kind: "stdio", command: "node", args: ["server.js"], env: {} },
  secretEnv: {},
};

/** A profile whose working folder says which session it is. */
function profileNumber(n: number): SandboxProfile {
  return {
    workingFolder: `/data/local-tools/files-lister-${n}`,
    tempFolder: `/data/temp/files-lister-${n}`,
    settingsFolder: null,
    readOnlyPaths: [],
    deniedPaths: [],
    env: {},
    network: { bridge: null, allowedSites: [] },
    timeLimitMs: 60_000,
  };
}

const ok: SandboxCheck = { ok: true, reason: null, missing: [] };

/** A sandbox that opens fake sessions and keeps each one. */
class TestSandbox implements Pick<Sandbox, "check" | "open"> {
  readonly sessions: FakeSandboxSession[] = [];
  checkResult: SandboxCheck = ok;
  /** The fence proof each new session reports. */
  fence: SandboxFence = { state: "fenced" };

  async check(): Promise<SandboxCheck> {
    return this.checkResult;
  }

  async open(profile: SandboxProfile): Promise<FakeSandboxSession> {
    if (!this.checkResult.ok) throw new Error("bubblewrap is not installed");
    const session = new FakeSandboxSession({ profile, program: idleProgram, fence: this.fence });
    this.sessions.push(session);
    return session;
  }
}

/**
 * A factory whose connectors answer with their session's working folder.
 * The tool `outlast` runs until the session's time limit runs out.
 */
class TestFactory implements ConnectorFactory {
  readonly transport = "stdio";
  readonly contexts: ConnectorFactoryContext[] = [];
  closed = 0;

  create(created: ConnectorConfig, context: ConnectorFactoryContext): ConnectorClient {
    this.contexts.push(context);
    const session = context.sandbox;
    if (session === undefined) throw new Error("no session");
    return {
      id: created.id,
      listTools: async () => [],
      callTool: async (name) => {
        if (name === "outlast") await session.close();
        if (session.fence.state === "stopped") throw new Error("its sandbox session has ended");
        return session.profile.workingFolder;
      },
      close: async () => {
        this.closed += 1;
      },
    };
  }
}

function setUp(sandbox: TestSandbox | null = new TestSandbox()) {
  const factory = new TestFactory();
  let prepared = 0;
  const local = new PluginLocalTools({
    sandbox,
    factory,
    context: {} as Omit<ConnectorFactoryContext, "trust" | "sandbox">,
    prepare: async () => {
      prepared += 1;
      return { config, profile: profileNumber(prepared) };
    },
  });
  return { local, factory, sandbox };
}

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

  it("refuses a local tool the host prepared under another connector id", async () => {
    const sandbox = new TestSandbox();
    const local = new PluginLocalTools({
      sandbox,
      factory: new TestFactory(),
      context: {} as Omit<ConnectorFactoryContext, "trust" | "sandbox">,
      prepare: async () => ({ config: { ...config, id: "other" }, profile: profileNumber(1) }),
    });
    await expect(local.connector(lister).listTools()).rejects.toThrow(
      'was prepared as connector "other"',
    );
    expect(sandbox.sessions).toEqual([]);
  });
});
