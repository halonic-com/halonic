import { MemorySecrets, MemoryTokenStore } from "@halonicjs/adapter-memory";
import type { ConnectorConfig, ConnectorFactoryContext, ConnectorPin } from "@halonicjs/ports";
import { contractGrant, RecordedRegistryClient } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it, vi } from "vitest";
import { contractServer, FakeFolders, FakeStarter } from "../stdio/fake-program.spec.ts";
import { McpStdioConnectorFactory } from "../stdio/stdio-connector.ts";

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

function setUp(
  http: ConnectorFactoryContext["http"] = new RecordedRegistryClient(),
  starter = new FakeStarter(contractServer([])),
) {
  const folders = new FakeFolders();
  const secrets = new MemorySecrets({ "mail-token": "value-from-secrets" });
  const read = vi.spyOn(secrets, "get");
  const factory = new McpStdioConnectorFactory({
    starter,
    folders,
    inheritedEnv: { PATH: "/usr/bin", HOME: "/acme/home", npm_config_cache: "/acme/home/.npm" },
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
        PATH: "/usr/bin",
        HOME: launch?.cwd,
        TMPDIR: launch?.cwd,
        npm_config_registry: "https://registry.npmjs.org",
      });
      expect(launch?.env).not.toHaveProperty("npm_config_cache");
      expect(launch?.args).toEqual(["-y", "@acme/mail-mcp@2.3.1"]);
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
