import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MemorySecrets, MemoryTokenStore } from "@halonicjs/adapter-memory";
import type {
  ConnectorClient,
  ConnectorConfig,
  ConnectorFactory,
  ConnectorFactoryContext,
} from "@halonicjs/ports";
import { contractGrant, FakeSandboxSession } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { contractProgram } from "./fake-mcp-program.spec.ts";
import type { StdioConfig } from "./local-tool-launch.ts";
import { localToolLaunch } from "./local-tool-launch.ts";
import { SandboxStdioConnectorFactory } from "./sandbox-connector.ts";
import {
  type WorkspaceConnectorSetting,
  workspaceConnectorPlace,
} from "./workspace-connector-place.ts";
import { WorkspaceStdioConnectorFactory } from "./workspace-stdio-factory.ts";

function mailConfig(stdio: Partial<StdioConfig> = {}): ConnectorConfig {
  return {
    id: "mail",
    transport: {
      kind: "stdio",
      command: "node",
      args: ["tools/mail.js"],
      env: {},
      sites: ["mail.acme.test"],
      ...stdio,
    },
    secretEnv: {},
  };
}

verifies("connector-stdio-sandbox.workspace-connector-start", () => {
  let workspace: string;
  let setting: WorkspaceConnectorSetting;
  let reached: Parameters<typeof contractProgram>[0];

  beforeEach(async () => {
    workspace = await realpath(await mkdtemp(join(tmpdir(), "workspace-connector-")));
    const writer = join(workspace, "files", "agents", "writer");
    await mkdir(writer, { recursive: true });
    await mkdir(join(workspace, "tools"));
    await writeFile(join(workspace, "tools", "mail.js"), "");
    await writeFile(join(writer, "server.js"), "");
    setting = {
      workingFolder: join(workspace, "..", "connector-work"),
      tempFolder: join(workspace, "..", "connector-tmp"),
      workspaceRoot: workspace,
      agentWorkingFolders: [writer],
      deniedPaths: [],
      bridge: null,
      timeLimitMs: 60_000,
      path: "/usr/bin",
    };
    reached = [];
  });

  afterEach(async () => {
    await rm(workspace, { recursive: true, force: true });
  });

  function setUp(config: ConnectorConfig) {
    const stdio = config.transport as StdioConfig;
    const sandbox = new FakeSandboxSession({
      profile: localToolLaunch(stdio, workspaceConnectorPlace(stdio, setting), null, {}).profile,
      program: contractProgram(reached),
    });
    const factory = new SandboxStdioConnectorFactory({
      clientInfo: { name: "halonic", version: "0.1.0" },
      localTools: () => undefined,
      workspaceConnectors: () => ({ setting, callTimeoutMs: 60_000 }),
      onBlocked: () => undefined,
      onUndeclaredTool: () => undefined,
    });
    const context: ConnectorFactoryContext = {
      secrets: new MemorySecrets(),
      tokens: new MemoryTokenStore(),
      http: { fetch: () => Promise.reject(new Error("no network here")) },
      trust: contractGrant,
      sandbox,
    };
    return { sandbox, factory, context };
  }

  it("starts a script in the workspace and offers every tool the server lists", async () => {
    const { sandbox, factory, context } = setUp(mailConfig());
    const client = factory.create(mailConfig(), context);
    const tools = await client.listTools();
    expect(tools.length).toBeGreaterThan(0);
    await client.callTool(tools[0]?.name ?? "", {});
    expect(sandbox.started[0]).toMatchObject({ program: "node", cwd: workspace });
    await client.close();
  });

  it("starts a script in the connector file's cwd, inside the workspace", async () => {
    const config = mailConfig({ cwd: "tools" });
    const { sandbox, factory, context } = setUp(config);
    const client = factory.create(config, context);
    await client.listTools();
    expect(sandbox.started[0]?.cwd).toBe(join(workspace, "tools"));
    await client.close();
  });

  it("starts nothing for a connector that runs a file in an agent's working folder", async () => {
    const config = mailConfig({ args: ["files/agents/writer/server.js"] });
    const { sandbox, factory, context } = setUp(config);
    const start = vi.spyOn(sandbox, "start");
    const client = factory.create(config, context);
    await expect(client.listTools()).rejects.toThrow(/agent working folder/);
    expect(start).not.toHaveBeenCalled();
  });

  describe("WorkspaceStdioConnectorFactory", () => {
    const created: string[] = [];
    function fake(name: string): ConnectorFactory {
      return {
        transport: "stdio",
        create: () => {
          created.push(name);
          return {} as ConnectorClient;
        },
      };
    }
    function through(isLocalTool: boolean, sandbox: boolean) {
      const { context } = setUp(mailConfig());
      const factory = new WorkspaceStdioConnectorFactory({
        sandboxed: fake("sandboxed"),
        unfenced: fake("unfenced"),
        isLocalTool: () => isLocalTool,
      });
      const { sandbox: _session, ...withoutSession } = context;
      factory.create(mailConfig(), sandbox ? context : withoutSession);
      return created.splice(0);
    }

    it("gives a connector to the sandboxed factory when the context has a session", () => {
      expect(through(false, true)).toEqual(["sandboxed"]);
    });

    it("starts a workspace connector as before when the host has no session", () => {
      expect(through(false, false)).toEqual(["unfenced"]);
    });

    it("never gives a plugin's local tool to the unfenced factory", () => {
      expect(through(true, false)).toEqual(["sandboxed"]);
    });
  });
});
