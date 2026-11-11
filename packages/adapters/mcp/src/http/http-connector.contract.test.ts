import { MemorySecrets, MemoryTokenStore } from "@halonicjs/adapter-memory";
import { connectorClientContract, type ReachedCall } from "@halonicjs/testing-contracts";
import { refuseRealConnections } from "@halonicjs/testing-contracts/node";
import { contractServer } from "../stdio/fake-program.spec.ts";
import { FakeMcpHttpServer } from "./fake-http-server.spec.ts";
import { McpHttpConnectorFactory } from "./http-connector.ts";

refuseRealConnections();

for (const style of ["json", "event-stream"] as const) {
  connectorClientContract(`mcp-http, answers as ${style}`, "http", async () => {
    const reached: ReachedCall[] = [];
    return {
      factory: new McpHttpConnectorFactory({ clientInfo: { name: "halonic", version: "0.1.0" } }),
      config: {
        id: "notes",
        transport: { kind: "http", url: "https://notes.acme.test/mcp", headers: {} },
        secretEnv: {},
      },
      context: {
        secrets: new MemorySecrets(),
        tokens: new MemoryTokenStore(),
        http: new FakeMcpHttpServer(contractServer(reached), style, "session-1"),
      },
      reached: () => reached,
      programs: () => ({ started: 0, running: 0 }),
    };
  });
}
