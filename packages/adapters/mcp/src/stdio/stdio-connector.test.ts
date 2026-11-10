import { MemorySecrets, MemoryTokenStore } from "@halonicjs/adapter-memory";
import type { ConnectorConfig, ConnectorFactoryContext } from "@halonicjs/ports";
import { contractGrant, type ReachedCall } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it, vi } from "vitest";
import { contractServer, FakeStarter, unusedFolders } from "./fake-program.spec.ts";
import { McpStdioConnectorFactory } from "./stdio-connector.ts";

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
    inheritedEnv: { PATH: "/usr/bin", UNSET: undefined },
    clientInfo: { name: "halonic", version: "0.1.0" },
  });
  const context: ConnectorFactoryContext = {
    secrets,
    tokens: new MemoryTokenStore(),
    http: { fetch: async () => new Response("unused") },
    workspaceRoot: "/workspaces/acme",
    trust: contractGrant,
  };
  return { starter, factory, context, reached, secrets };
}

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
        cwd: "/workspaces/acme/tools",
      });
      await client.close();
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

  describe("starting the program", () => {
    it("puts secrets only in the environment, next to the inherited and configured variables", async () => {
      const { starter, factory, context } = setUp();
      const client = factory.create(config, context);
      await client.listTools();
      const [program] = starter.programs;
      expect(program?.launch).toEqual({
        program: "notes-mcp",
        args: ["--serve"],
        env: { PATH: "/usr/bin", NOTES_MODE: "quiet", NOTES_TOKEN: "value-from-secrets" },
        cwd: "/workspaces/acme/tools",
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
