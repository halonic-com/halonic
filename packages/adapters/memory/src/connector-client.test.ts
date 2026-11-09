import type { ConnectorConfig } from "@halonicjs/ports";
import { contractGrant, contractServerTools } from "@halonicjs/testing-contracts";
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
});
