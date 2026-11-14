import type { AgentHostAnswer, AgentHostTransport } from "@halonicjs/adapter-agent-host-client";
import { MemorySecrets, MemoryTokenStore } from "@halonicjs/adapter-memory";
import type { ConnectorConfig, ConnectorFactoryContext } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { agentHostToolLister, noHttpInStudio } from "./agent-host-tool-lister.ts";

const config: ConnectorConfig = {
  id: "notes",
  secretEnv: {},
  transport: { kind: "stdio", command: "acme-notes-server", args: [], env: {} },
};

const context: ConnectorFactoryContext = {
  secrets: new MemorySecrets(),
  tokens: new MemoryTokenStore(),
  http: noHttpInStudio,
  workspaceRoot: "/work/acme",
  workingFolders: [],
  trust: { location: "/work/acme", fingerprint: "hfp1:made-up" },
};

/** An agent host that opens a connector, answers its listing with `tools`, and records each route. */
function hostListing(tools: AgentHostAnswer): { transport: AgentHostTransport; routes: string[] } {
  const routes: string[] = [];
  const answers: Record<string, AgentHostAnswer> = {
    "POST /v1/connectors/open": { status: 200, body: { connector: "c1" } },
    "POST /v1/connectors/tools": tools,
    "POST /v1/connectors/close": { status: 200, body: { closed: true } },
  };
  const transport: AgentHostTransport = {
    request: async (route) => {
      routes.push(route);
      return answers[route] ?? { status: 404, body: {} };
    },
    stream: () => Promise.reject(new Error("This test streams nothing.")),
  };
  return { transport, routes };
}

verifies("studio.workspace-listed-tools", () => {
  it("reads the listing through the agent host and closes the connector", async () => {
    const tools = [{ name: "read_note", description: "Reads one note.", parameters: {} }];
    const { transport, routes } = hostListing({ status: 200, body: tools });

    const listed = await agentHostToolLister(transport)(config, context);

    expect(listed.map((tool) => tool.name)).toEqual(["read_note"]);
    expect(routes).toEqual([
      "POST /v1/connectors/open",
      "POST /v1/connectors/tools",
      "POST /v1/connectors/close",
    ]);
  });

  it("closes the connector when its listing can't be read", async () => {
    const { transport, routes } = hostListing({ status: 500, body: { error: "broke" } });

    await expect(agentHostToolLister(transport)(config, context)).rejects.toThrow();

    expect(routes.at(-1)).toBe("POST /v1/connectors/close");
  });

  it("refuses every http request, since the window starts no http connector", async () => {
    await expect(noHttpInStudio.fetch("https://notes.acme.example/mcp")).rejects.toThrow(
      "http servers",
    );
  });
});
