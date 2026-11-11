import { MemorySecrets, MemoryTokenStore } from "@halonicjs/adapter-memory";
import type { ConnectorConfig, ConnectorFactoryContext, ConnectorPin } from "@halonicjs/ports";
import { contractGrant, RecordedRegistryClient } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it, vi } from "vitest";
import { contractServer, FakeFolders, FakeStarter } from "../stdio/fake-program.spec.ts";
import { McpStdioConnectorFactory } from "../stdio/stdio-connector.ts";
import { computer, runnerComputer, windowsPath } from "./fake-runners.spec.ts";
import type { RunnerSearch } from "./find-runner.ts";

const pin: ConnectorPin = {
  registry: "npm",
  registryUrl: "https://registry.npmjs.org",
  package: "@acme/mail-mcp",
  version: "2.3.1",
};

function pinned(secretEnv: Record<string, string> = { MAIL_TOKEN: "mail-token" }): ConnectorConfig {
  return {
    id: "mail",
    transport: { kind: "stdio", command: "npx", args: ["-y", "@acme/mail-mcp"], env: {}, pin },
    secretEnv,
  };
}

const linuxEnv = { PATH: "/usr/bin", HOME: "/acme/home", npm_config_cache: "/acme/home/.npm" };

function setUp(
  http: ConnectorFactoryContext["http"] = new RecordedRegistryClient(),
  starter = new FakeStarter(contractServer([])),
  computer: { runners: RunnerSearch; inheritedEnv: Record<string, string> } = {
    runners: runnerComputer,
    inheritedEnv: linuxEnv,
  },
) {
  const folders = new FakeFolders();
  const secrets = new MemorySecrets({ "mail-token": "value-from-secrets" });
  const read = vi.spyOn(secrets, "get");
  const factory = new McpStdioConnectorFactory({
    starter,
    folders,
    ...computer,
    clientInfo: { name: "halonic", version: "0.1.0" },
  });
  const context: ConnectorFactoryContext = {
    secrets,
    tokens: new MemoryTokenStore(),
    http,
    workspaceRoot: "/workspaces/acme",
    trust: contractGrant,
  };
  return { starter, folders, factory, context, read };
}

verifies("mcp.pinned-launcher", () => {
  describe("before the program starts", () => {
    it("reads no secret and creates no folder when the pin is refused", async () => {
      const { starter, folders, factory, context, read } = setUp();
      const config = pinned();
      const other = { ...config.transport, args: ["-y", "@acme/mail-mcp@3.0.0"] };
      const client = factory.create({ ...config, transport: other }, context);
      await expect(client.listTools()).rejects.toThrow(
        'Halonic didn\'t start the connector "mail": the command asks for @acme/mail-mcp 3.0.0',
      );
      expect(read).not.toHaveBeenCalled();
      expect(folders.present()).toEqual([]);
      expect(starter.counts().started).toBe(0);
    });

    it("refuses a secret whose variable a pinned connector may not set, without reading it", async () => {
      const { starter, factory, context, read } = setUp();
      const client = factory.create(pinned({ NODE_OPTIONS: "mail-token" }), context);
      await expect(client.listTools()).rejects.toThrow("NODE_OPTIONS");
      expect(read).not.toHaveBeenCalled();
      expect(starter.counts().started).toBe(0);
    });

    it("refuses a runner it can't find, without reading a secret or creating a folder", async () => {
      const nowhere = {
        runners: computer([], { platform: "linux", path: "/usr/bin" }),
        inheritedEnv: linuxEnv,
      };
      const { starter, folders, factory, context, read } = setUp(undefined, undefined, nowhere);
      await expect(factory.create(pinned(), context).listTools()).rejects.toThrow(
        'Halonic didn\'t start the connector "mail": couldn\'t find "npx" on this computer',
      );
      expect(read).not.toHaveBeenCalled();
      expect(folders.present()).toEqual([]);
      expect(starter.counts().started).toBe(0);
    });

    it("creates no folder and starts nothing when closed while the registry is asked", async () => {
      const registry = new RecordedRegistryClient();
      const gate: { open?: () => void } = {};
      const slow = {
        fetch: async (url: string, init?: RequestInit) => {
          await new Promise<void>((resolve) => {
            gate.open = resolve;
          });
          return registry.fetch(url, init);
        },
      };
      const { starter, folders, factory, context } = setUp(slow);
      const client = factory.create(pinned(), context);
      const listing = client.listTools();
      await vi.waitFor(() => expect(gate.open).toBeDefined());
      await client.close();
      gate.open?.();
      await expect(listing).rejects.toThrow(
        'Connector "mail" was closed while its pin was checked.',
      );
      expect(folders.present()).toEqual([]);
      expect(starter.counts().started).toBe(0);
    });
  });

  describe("the started program", () => {
    it("gets its secrets and its home, config and temporary folders in the environment only", async () => {
      const { starter, factory, context } = setUp();
      const client = factory.create(pinned(), context);
      await client.listTools();
      const launch = starter.programs[0]?.launch;
      expect(launch?.env).toMatchObject({
        MAIL_TOKEN: "value-from-secrets",
        PATH: "/acme/bin:/usr/bin",
        HOME: launch?.cwd,
        TMPDIR: launch?.cwd,
        npm_config_registry: "https://registry.npmjs.org",
      });
      expect(launch?.env).not.toHaveProperty("npm_config_cache");
      expect(launch?.args).toEqual(["-y", "@acme/mail-mcp@2.3.1"]);
      await client.close();
    });

    it("gets the variables its connector names in inheritEnv, and no other", async () => {
      const env = { ...linuxEnv, AWS_PROFILE: "work", ANTHROPIC_API_KEY: "sk-ant-test" };
      const named = { runners: runnerComputer, inheritedEnv: env };
      const { starter, factory, context } = setUp(undefined, undefined, named);
      const config = pinned();
      const transport = { ...config.transport, inheritEnv: ["AWS_PROFILE"] };
      const client = factory.create({ ...config, transport }, context);
      await client.listTools();
      const launch = starter.programs[0]?.launch;
      expect(launch?.env).toMatchObject({ AWS_PROFILE: "work", HOME: launch?.cwd });
      expect(launch?.env).not.toHaveProperty("ANTHROPIC_API_KEY");
      await client.close();
    });

    it("gets the harness agents' working folders for the starter to check", async () => {
      const { starter, factory, context } = setUp();
      const coder = "/workspaces/acme/files/agents/coder";
      const client = factory.create(pinned(), { ...context, workingFolders: [coder] });
      await client.listTools();
      expect(starter.programs[0]?.launch.workingFolders).toEqual({
        workspaceRoot: "/workspaces/acme",
        folders: [coder],
      });
      await client.close();
    });

    it("starts the runner it found, with the runner's folder first on its PATH", async () => {
      const { starter, factory, context } = setUp();
      const client = factory.create(pinned(), context);
      await client.listTools();
      const launch = starter.programs[0]?.launch;
      expect(launch?.program).toBe("/acme/bin/npx");
      expect(launch?.env["PATH"]).toBe("/acme/bin:/usr/bin");
      await client.close();
    });

    it("starts npm's npx.cmd on Windows as node.exe with npx-cli.js, keeping the PATH's own name", async () => {
      const inNode = (...parts: string[]) => windowsPath("C", "Acme", "nodejs", ...parts);
      const npxCli = inNode("node_modules", "npm", "bin", "npx-cli.js");
      const windows = {
        runners: computer([inNode("npx.cmd"), inNode("node.exe"), npxCli], {
          platform: "win32",
          path: inNode(),
        }),
        inheritedEnv: { Path: windowsPath("C", "Windows") },
      };
      const { starter, factory, context } = setUp(undefined, undefined, windows);
      const client = factory.create(pinned(), context);
      await client.listTools();
      const launch = starter.programs[0]?.launch;
      expect(launch?.program).toBe(inNode("node.exe"));
      expect(launch?.args).toEqual([npxCli, "-y", "@acme/mail-mcp@2.3.1"]);
      expect(launch?.env["Path"]).toBe(`${inNode()};${windowsPath("C", "Windows")}`);
      expect(launch?.env).not.toHaveProperty("PATH");
      await client.close();
    });

    it("deletes its folder once closed, and when its start fails", async () => {
      const { folders, factory, context } = setUp();
      const client = factory.create(pinned(), context);
      await client.listTools();
      expect(folders.present()).toHaveLength(1);
      await client.close();
      expect(folders.present()).toEqual([]);

      const silent = new FakeStarter((message, program) => {
        if (message["method"] !== "initialize") return;
        const result = { protocolVersion: "1999-01-01", capabilities: { tools: {} } };
        program.send({ jsonrpc: "2.0", id: message["id"], result });
      });
      const failing = setUp(new RecordedRegistryClient(), silent);
      await expect(failing.factory.create(pinned(), failing.context).listTools()).rejects.toThrow();
      expect(failing.folders.present()).toEqual([]);
    });
  });
});
