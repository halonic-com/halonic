import type { StdioTransport } from "@halonicjs/app";
import type { ConnectorConfig } from "@halonicjs/ports";
import {
  contractGrant,
  contractServerTools,
  npmPackage,
  npmRegistryUrl,
  RecordedRegistryClient,
} from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { MemoryConnectorFactory } from "./connector-client.ts";
import { MemorySecrets, MemoryTokenStore } from "./secrets.ts";

const server = { tools: contractServerTools, answer: () => "ok" };

function context(trusted: boolean) {
  return {
    secrets: new MemorySecrets(),
    tokens: new MemoryTokenStore(),
    http: { fetch: async () => new Response("unused") },
    trust: trusted ? contractGrant : null,
  };
}

const httpConfig = {
  id: "notes",
  transport: { kind: "http", url: "https://notes.acme.test/mcp", headers: {} },
  secretEnv: {},
} as const;

verifies("memory.connector-client", () => {
  it("refuses a config of another transport kind, naming the connector and both kinds", () => {
    const factory = new MemoryConnectorFactory("http", server);
    const stdio: ConnectorConfig = {
      id: "notes",
      transport: { kind: "stdio", command: "notes-mcp", args: [], env: {} },
      secretEnv: {},
    };
    expect(() => factory.create(stdio, context(true))).toThrow(
      'Connector "notes" uses stdio, but this factory serves http.',
    );
  });

  it("keeps its own tools, whatever a caller does with a listing", async () => {
    const tools = structuredClone(contractServerTools);
    const factory = new MemoryConnectorFactory("http", { ...server, tools });
    (tools[0] as { name: string }).name = "changed_before";
    const client = factory.create(httpConfig, context(true));
    const listed = await client.listTools();
    (listed[0] as { name: string }).name = "changed_after";
    expect(await client.listTools()).toEqual(contractServerTools);
  });

  it("says which connector and tool it refused, and why", async () => {
    const factory = new MemoryConnectorFactory("http", server);
    const client = factory.create(httpConfig, context(false));
    await expect(client.callTool("update_note", {})).rejects.toThrow(
      'Connector "notes" can\'t call "update_note" until the workspace is trusted.',
    );
    await expect(client.callTool("no_such_tool", {})).rejects.toThrow(
      'Connector "notes" has no tool "no_such_tool".',
    );
  });

  it("says a stdio connector starts a program only once the workspace is trusted", async () => {
    const factory = new MemoryConnectorFactory("stdio", server);
    const client = factory.create(
      { ...httpConfig, transport: { kind: "stdio", command: "notes-mcp", args: [], env: {} } },
      context(false),
    );
    await expect(client.listTools()).rejects.toThrow(
      'Connector "notes" starts a program, so it starts only once the workspace is trusted.',
    );
  });

  it("starts a stdio program once when two calls arrive while its pin is looked up", async () => {
    const factory = new MemoryConnectorFactory("stdio", server);
    const client = factory.create(pinnedConfig(), {
      ...context(true),
      http: new RecordedRegistryClient(),
    });
    await Promise.all([client.listTools(), client.callTool("read_note", {})]);
    expect(factory.programs()).toEqual({ started: 1, running: 1 });
    await client.close();
    await client.listTools();
    expect(factory.programs()).toEqual({ started: 2, running: 1 });
  });

  it("tries the start again on the next call after a refused one", async () => {
    const factory = new MemoryConnectorFactory("stdio", server);
    const client = factory.create(pinnedConfig(), {
      ...context(true),
      http: new RecordedRegistryClient({ down: true }),
    });
    await expect(client.listTools()).rejects.toThrow(
      `Halonic didn't start connector "mail": ${npmRegistryUrl} can't be reached to look up @acme/mail-mcp 2.3.1.`,
    );
    await expect(client.listTools()).rejects.toThrow("can't be reached");
    expect(factory.programs()).toEqual({ started: 0, running: 0 });
  });

  it("starts an unpinned program in its cwd, or else in the workspace", async () => {
    const factory = new MemoryConnectorFactory("stdio", server);
    const plain: ConnectorConfig = {
      id: "notes",
      transport: { kind: "stdio", command: "notes-mcp", args: [], env: {} },
      secretEnv: {},
    };
    const inCwd: ConnectorConfig = {
      ...plain,
      transport: { ...plain.transport, cwd: "/srv/notes" } as StdioTransport,
    };
    for (const [config, workspaceRoot] of [
      [inCwd, "/workspaces/acme"],
      [plain, "/workspaces/acme"],
      [plain, undefined],
    ] as const) {
      const client = factory.create(config, {
        ...context(true),
        ...(workspaceRoot ? { workspaceRoot } : {}),
      });
      await client.listTools();
      await client.close();
    }
    expect(factory.launches().map((launch) => launch.folder)).toEqual([
      "/srv/notes",
      "/workspaces/acme",
      "",
    ]);
  });
});

function pinnedConfig(): ConnectorConfig {
  return {
    id: "mail",
    transport: {
      kind: "stdio",
      command: "npx",
      args: ["-y", npmPackage.name],
      env: {},
      pin: {
        registry: "npm",
        registryUrl: npmRegistryUrl,
        package: npmPackage.name,
        version: "2.3.1",
      },
    },
    secretEnv: {},
  };
}
