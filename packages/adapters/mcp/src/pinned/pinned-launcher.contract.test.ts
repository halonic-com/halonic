import { MemorySecrets, MemoryTokenStore } from "@halonicjs/adapter-memory";
import type {
  ConnectorClient,
  ConnectorConfig,
  ConnectorFactory,
  ConnectorFactoryContext,
  ConnectorPin,
} from "@halonicjs/ports";
import { type ConnectorLaunch, connectorPinContract } from "@halonicjs/testing-contracts";
import { refuseRealConnections } from "@halonicjs/testing-contracts/node";
import { contractServer, FakeFolders, FakeStarter } from "../stdio/fake-program.spec.ts";
import type { ProgramLaunch, ProgramStarter, RunningProgram } from "../stdio/program.ts";
import { McpStdioConnectorFactory } from "../stdio/stdio-connector.ts";
import { runnerComputer } from "./fake-runners.spec.ts";

refuseRealConnections();

/**
 * Remembers each program started with the pin of the connector that
 * started it. The suite runs one client at a time, so the pin is the one of
 * the client whose call is running.
 */
class RecordingStarter implements ProgramStarter {
  readonly launches: ConnectorLaunch[] = [];
  starting: ConnectorPin | null = null;
  readonly #inner = new FakeStarter(contractServer([]));

  start(launch: ProgramLaunch): Promise<RunningProgram> {
    const { program, args, env, cwd } = launch;
    this.launches.push({ pin: this.starting, folder: cwd, command: program, args, env });
    return this.#inner.start(launch);
  }
}

/** The factory under test, telling the starter which connector's call is running. */
function recording(factory: ConnectorFactory, starter: RecordingStarter): ConnectorFactory {
  return {
    transport: factory.transport,
    create(config: ConnectorConfig, context: ConnectorFactoryContext): ConnectorClient {
      const client = factory.create(config, context);
      const pin = config.transport.kind === "stdio" ? (config.transport.pin ?? null) : null;
      return {
        id: client.id,
        listTools: () => {
          starter.starting = pin;
          return client.listTools();
        },
        callTool: (name, args, options) => {
          starter.starting = pin;
          return client.callTool(name, args, options);
        },
        close: () => client.close(),
      };
    },
  };
}

connectorPinContract("mcp-stdio", async ({ inheritedEnv }) => {
  const starter = new RecordingStarter();
  const factory = new McpStdioConnectorFactory({
    starter,
    folders: new FakeFolders(),
    runners: runnerComputer,
    inheritedEnv,
    clientInfo: { name: "halonic", version: "0.1.0" },
  });
  return {
    factory: recording(factory, starter),
    context: {
      secrets: new MemorySecrets(),
      tokens: new MemoryTokenStore(),
      workspaceRoot: "/workspaces/acme",
    },
    launches: () => starter.launches,
  };
});
