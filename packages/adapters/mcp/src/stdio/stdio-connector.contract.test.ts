import { MemorySecrets, MemoryTokenStore } from "@halonicjs/adapter-memory";
import { connectorClientContract, type ReachedCall } from "@halonicjs/testing-contracts";
import { refuseRealConnections } from "@halonicjs/testing-contracts/node";
import { contractServer, FakeStarter } from "./fake-program.spec.ts";
import { McpStdioConnectorFactory } from "./stdio-connector.ts";

refuseRealConnections();

connectorClientContract("mcp-stdio", "stdio", async () => {
  const reached: ReachedCall[] = [];
  const starter = new FakeStarter(contractServer(reached));
  return {
    factory: new McpStdioConnectorFactory({
      starter,
      inheritedEnv: { PATH: "/usr/bin" },
      clientInfo: { name: "halonic", version: "0.1.0" },
    }),
    config: {
      id: "notes",
      transport: { kind: "stdio", command: "notes-mcp", args: ["--serve"], env: {} },
      secretEnv: {},
    },
    context: {
      secrets: new MemorySecrets(),
      tokens: new MemoryTokenStore(),
      http: { fetch: async () => new Response("unused") },
      workspaceRoot: "/workspaces/acme",
    },
    reached: () => reached,
    programs: () => starter.counts(),
  };
});
