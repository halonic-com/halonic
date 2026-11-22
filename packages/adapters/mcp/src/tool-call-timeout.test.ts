import { MemorySecrets, MemoryTokenStore } from "@halonicjs/adapter-memory";
import { type ConnectorConfig, isConnectorToolTimeout } from "@halonicjs/ports";
import { contractGrant } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, expect, it, vi } from "vitest";
import { FakeMcpHttpServer } from "./http/fake-http-server.spec.ts";
import { McpHttpConnectorFactory } from "./http/http-connector.ts";
import { defaultHttpLimits } from "./http/http-transport.ts";
import { unusedRunners } from "./pinned/fake-runners.spec.ts";
import { McpStoppedError } from "./protocol/errors.ts";
import { type FakeHandler, FakeStarter, unusedFolders } from "./stdio/fake-program.spec.ts";
import { McpStdioConnectorFactory } from "./stdio/stdio-connector.ts";
import { defaultStdioLimits } from "./stdio/stdio-transport.ts";

const context = {
  secrets: new MemorySecrets({ "notes-token": "acme-token" }),
  tokens: new MemoryTokenStore(),
  http: { fetch: async () => new Response("unused") },
  workspaceRoot: "/workspaces/acme",
  trust: contractGrant,
};

/** A server that starts its session and lists nothing, and never answers a tool call. */
const silentOnCalls = (message: Record<string, unknown>, sink: { send(m: unknown): void }) => {
  const { id, method } = message;
  if (typeof id !== "number" || method === "tools/call") return;
  const result =
    method === "initialize"
      ? { protocolVersion: "2025-11-25", capabilities: { tools: {} } }
      : { tools: [] };
  sink.send({ jsonrpc: "2.0", id, result });
};

function stdioNotes(handler: FakeHandler) {
  const factory = new McpStdioConnectorFactory({
    starter: new FakeStarter(handler),
    folders: unusedFolders,
    runners: unusedRunners,
    inheritedEnv: {},
    clientInfo: { name: "halonic", version: "0.1.0" },
    limits: { ...defaultStdioLimits, requestTimeoutMs: 5000 },
  });
  const config: ConnectorConfig = {
    id: "notes",
    transport: { kind: "stdio", command: "notes-mcp", args: [], env: {} },
    secretEnv: {},
  };
  return factory.create(config, context);
}

afterEach(() => {
  vi.useRealTimers();
});

verifies("mcp.tool-call-timeout", () => {
  it("throws the engine's timeout from a stdio call the program doesn't answer in time", async () => {
    vi.useFakeTimers();
    const client = stdioNotes(silentOnCalls);
    const failure = client.callTool("read_note", {}).catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(5000);
    const error = await failure;

    expect(isConnectorToolTimeout(error)).toBe(true);
    expect(error).toMatchObject({
      withinMs: 5000,
      message: `Connector "notes"'s tool "read_note" didn't answer within 5 seconds, so Halonic stopped its program. The next call starts it again.`,
    });
    expect((error as Error).cause).toBeInstanceOf(McpStoppedError);
    await vi.runAllTimersAsync();
    await client.close();
  });

  it("throws the engine's timeout from an HTTP call the server doesn't answer in time", async () => {
    vi.useFakeTimers();
    const server = new FakeMcpHttpServer(silentOnCalls);
    const hanging = {
      fetch: (url: string, init?: RequestInit) =>
        String(init?.body).includes('"tools/call"')
          ? new Promise<Response>((_resolve, reject) => {
              init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
            })
          : server.fetch(url, init),
    };
    const factory = new McpHttpConnectorFactory({
      clientInfo: { name: "halonic", version: "0.1.0" },
      limits: { ...defaultHttpLimits, requestTimeoutMs: 5000 },
    });
    const client = factory.create(
      {
        id: "notes",
        transport: { kind: "http", url: "https://notes.acme.test/mcp", headers: {} },
        secret: "notes-token",
        secretEnv: {},
      },
      { ...context, http: hanging },
    );
    const failure = client.callTool("read_note", {}).catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(5000);
    const error = await failure;

    expect(isConnectorToolTimeout(error)).toBe(true);
    expect(error).toMatchObject({
      withinMs: 5000,
      message: `Connector "notes"'s tool "read_note" didn't answer within 5 seconds.`,
    });
    await client.close();
  });

  it("throws the connector's own error for a program that stops during a call", async () => {
    const client = stdioNotes((message, program) => {
      if (message["method"] === "tools/call") {
        program.exit();
        return;
      }
      silentOnCalls(message, program);
    });
    const error = await client.callTool("read_note", {}).catch((caught: unknown) => caught);

    expect(isConnectorToolTimeout(error)).toBe(false);
    expect(error).toBeInstanceOf(McpStoppedError);
    await client.close();
  });
});
