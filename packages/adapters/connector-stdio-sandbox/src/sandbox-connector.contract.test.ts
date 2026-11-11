import { MemorySecrets, MemoryTokenStore } from "@halonicjs/adapter-memory";
import {
  connectorClientContract,
  FakeSandboxSession,
  type ReachedCall,
} from "@halonicjs/testing-contracts";
import { refuseRealConnections } from "@halonicjs/testing-contracts/node";
import { contractProgram, scriptConfig, testPlace, testProfile } from "./fake-mcp-program.spec.ts";
import { SandboxStdioConnectorFactory } from "./sandbox-connector.ts";

refuseRealConnections();

connectorClientContract("connector-stdio-sandbox", "stdio", async () => {
  const reached: ReachedCall[] = [];
  const sandbox = new FakeSandboxSession({
    profile: testProfile,
    program: contractProgram(reached),
  });
  return {
    factory: new SandboxStdioConnectorFactory({
      clientInfo: { name: "halonic", version: "0.1.0" },
      onBlocked: () => undefined,
      localTools: () => ({ place: testPlace }),
    }),
    config: scriptConfig,
    context: {
      secrets: new MemorySecrets(),
      tokens: new MemoryTokenStore(),
      http: { fetch: async () => new Response("unused") },
      sandbox,
    },
    reached: () => reached,
    programs: () => ({ started: sandbox.started.length, running: sandbox.running }),
  };
});
