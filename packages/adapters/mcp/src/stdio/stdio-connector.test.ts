import { join, resolve } from "node:path";
import { MemorySecrets, MemoryTokenStore } from "@halonicjs/adapter-memory";
import type { ConnectorConfig, ConnectorFactoryContext, SandboxProfile } from "@halonicjs/ports";
import {
  contractGrant,
  FakeSandboxSession,
  idleProgram,
  type ReachedCall,
} from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it, vi } from "vitest";
import { unusedRunners } from "../pinned/fake-runners.spec.ts";
import { contractServer, FakeStarter, unusedFolders } from "./fake-program.spec.ts";
import { McpStdioConnectorFactory } from "./stdio-connector.ts";

/** Absolute on every computer: on Windows `resolve` adds the drive letter, as for a real workspace. */
const workspaceRoot = resolve("/workspaces/acme");

const config: ConnectorConfig = {
  id: "notes",
  transport: {
    kind: "stdio",
    command: "notes-mcp",
    args: ["--serve"],
    env: { NOTES_MODE: "quiet" },
    cwd: "tools",
  },
  secretEnv: { NOTES_TOKEN: "notes-token" },
};

function setUp(secrets = new MemorySecrets({ "notes-token": "value-from-secrets" })) {
  const reached: ReachedCall[] = [];
  const starter = new FakeStarter(contractServer(reached));
  const factory = new McpStdioConnectorFactory({
    starter,
    folders: unusedFolders,
    runners: unusedRunners,
    inheritedEnv: { PATH: "/usr/bin", ANTHROPIC_API_KEY: "sk-ant-test", UNSET: undefined },
    clientInfo: { name: "halonic", version: "0.1.0" },
  });
  const context: ConnectorFactoryContext = {
    secrets,
    tokens: new MemoryTokenStore(),
    http: { fetch: async () => new Response("unused") },
    workspaceRoot,
    trust: contractGrant,
  };
  return { starter, factory, context, reached, secrets };
}

/** A profile for a session no program is started in. */
const unusedProfile: SandboxProfile = {
  workingFolder: join(workspaceRoot, "tools"),
  tempFolder: join(workspaceRoot, "tmp"),
  settingsFolder: null,
  readOnlyPaths: [],
  deniedPaths: [],
  env: {},
  network: { bridge: null, allowedSites: [] },
  timeLimitMs: 60_000,
};

verifies("mcp.stdio-connector", () => {
  describe("before the program starts", () => {
    it("without a grant, reads no secret and starts nothing", async () => {
      const { starter, factory, context, secrets } = setUp();
      const read = vi.spyOn(secrets, "get");
      const client = factory.create(config, { ...context, trust: null });
      await expect(client.listTools()).rejects.toThrow(
        'Connector "notes" starts a program, so it starts only once the workspace is trusted.',
      );
      expect(read).not.toHaveBeenCalled();
      expect(starter.counts().started).toBe(0);
    });

    it("starts a package runner without a pin as configured, in its cwd, like any trusted program", async () => {
      const { starter, factory, context } = setUp();
      const npx = { ...config.transport, command: "npx", args: ["-y", "@acme/notes-mcp"] };
      const client = factory.create({ ...config, transport: npx }, context);
      await client.listTools();
      expect(starter.counts().started).toBe(1);
      expect(starter.programs[0]?.launch).toMatchObject({
        program: "npx",
        args: ["-y", "@acme/notes-mcp"],
        cwd: join(workspaceRoot, "tools"),
      });
      await client.close();
    });

    it("gives the starter the harness agents' working folders to check, and none when there are none", async () => {
      const { starter, factory, context } = setUp();
      const coder = join(workspaceRoot, "files/agents/coder");
      const guarded = factory.create(config, { ...context, workingFolders: [coder] });
      await guarded.listTools();
      expect(starter.programs[0]?.launch.workingFolders).toEqual({
        workspaceRoot,
        folders: [coder],
      });
      const open = factory.create(config, { ...context, workingFolders: [] });
      await open.listTools();
      expect(starter.programs[1]?.launch).not.toHaveProperty("workingFolders");
      await guarded.close();
      await open.close();
    });

    it("refuses a secret that isn't set, by name, and tries again on the next call", async () => {
      const { starter, factory, context } = setUp(new MemorySecrets());
      const client = factory.create(config, context);
      await expect(client.listTools()).rejects.toThrow(
        'Connector "notes" needs the secret "notes-token", which isn\'t set.',
      );
      await expect(client.listTools()).rejects.toThrow("notes-token");
      expect(starter.counts().started).toBe(0);
    });

    it("refuses where programs can't start, and refuses another transport kind", async () => {
      const { factory, context } = setUp();
      const { workspaceRoot: _left, ...noWorkspace } = context;
      await expect(factory.create(config, noWorkspace).listTools()).rejects.toThrow(
        "can't run here",
      );
      const http: ConnectorConfig = {
        ...config,
        transport: { kind: "http", url: "https://notes.acme.test/mcp", headers: {} },
      };
      expect(() => factory.create(http, context)).toThrow(
        'Connector "notes" uses http, but this factory serves stdio.',
      );
    });
  });
});

verifies("ports.connector-sandbox-session", () => {
  it("refuses a context with a sandbox session, so the program can't start outside the fence", async () => {
    const { starter, factory, context, secrets } = setUp();
    const read = vi.spyOn(secrets, "get");
    const sandbox = new FakeSandboxSession({ profile: unusedProfile, program: idleProgram });
    expect(() => factory.create(config, { ...context, sandbox })).toThrow(
      'Connector "notes" must start in its sandbox session, and this factory starts programs outside the sandbox.',
    );
    expect(read).not.toHaveBeenCalled();
    expect(starter.counts().started).toBe(0);
    expect(sandbox.started).toEqual([]);
  });
});

verifies("mcp.stdio-connector", () => {
  describe("starting the program", () => {
    it("puts secrets only in the environment, next to the base it inherits and the configured variables", async () => {
      const { starter, factory, context } = setUp();
      const client = factory.create(config, context);
      await client.listTools();
      const [program] = starter.programs;
      expect(program?.launch).toEqual({
        program: "notes-mcp",
        args: ["--serve"],
        env: { PATH: "/usr/bin", NOTES_MODE: "quiet", NOTES_TOKEN: "value-from-secrets" },
        // Only what the connector file writes is read for a skill's scripts/ (HAL-4777).
        checkedEnv: { NOTES_MODE: "quiet" },
        cwd: join(workspaceRoot, "tools"),
      });
      await client.close();
    });

    it("adds each variable the connector names in inheritEnv, under its own env and secrets", async () => {
      const { starter, context } = setUp();
      const factory = new McpStdioConnectorFactory({
        starter,
        folders: unusedFolders,
        runners: unusedRunners,
        inheritedEnv: {
          PATH: "/usr/bin",
          AWS_PROFILE: "work",
          NOTES_MODE: "loud",
          GITHUB_TOKEN: "x",
        },
        clientInfo: { name: "halonic", version: "0.1.0" },
      });
      const transport: ConnectorConfig["transport"] = {
        kind: "stdio",
        command: "notes-mcp",
        args: ["--serve"],
        env: { NOTES_MODE: "quiet" },
        inheritEnv: ["AWS_PROFILE", "NOTES_MODE", "GITHUB_TOKEN", "KUBECONFIG"],
      };
      const client = factory.create({ ...config, transport }, context);
      await client.listTools();
      expect(starter.programs[0]?.launch.env).toEqual({
        PATH: "/usr/bin",
        AWS_PROFILE: "work",
        NOTES_MODE: "quiet",
        NOTES_TOKEN: "value-from-secrets",
      });
      await client.close();
    });

    it("throws a tool's own failure apart from the message, which is ours", async () => {
      const { factory, context } = setUp();
      const client = factory.create(config, context);
      const error = await client.callTool("broken_note", {}).catch((caught: unknown) => caught);
      expect(error).toMatchObject({
        name: "ConnectorToolError",
        message: 'Connector "notes" says its tool "broken_note" failed.',
        toolText: "it broke",
      });
      await client.close();
    });

    it("stops a program whose server speaks none of our versions, each time it starts", async () => {
      const { context } = setUp();
      const starter = new FakeStarter((message, program) => {
        if (message["method"] !== "initialize") return;
        const result = { protocolVersion: "1999-01-01", capabilities: { tools: {} } };
        program.send({ jsonrpc: "2.0", id: message["id"], result });
      });
      const factory = new McpStdioConnectorFactory({
        starter,
        folders: unusedFolders,
        runners: unusedRunners,
        inheritedEnv: {},
        clientInfo: { name: "halonic", version: "0.1.0" },
      });
      const client = factory.create(config, context);
      const unsupported = { name: "McpError", code: "unsupported-version" };
      await expect(client.listTools()).rejects.toMatchObject(unsupported);
      await expect(client.listTools()).rejects.toMatchObject(unsupported);
      expect(starter.counts()).toEqual({ started: 2, running: 0 });
    });

    it("refuses calls once closed, without starting again", async () => {
      const { starter, factory, context } = setUp();
      const client = factory.create(config, context);
      await client.listTools();
      await client.close();
      await expect(client.listTools()).rejects.toThrow('Connector "notes" is closed.');
      expect(starter.counts()).toEqual({ started: 1, running: 0 });
    });
  });
});
