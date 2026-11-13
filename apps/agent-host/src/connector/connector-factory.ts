import {
  SandboxStdioConnectorFactory,
  SessionWorkspaceFactory,
} from "@halonicjs/adapter-connector-stdio-sandbox";
import { createNodeHttpClient } from "@halonicjs/adapter-http-node";
import {
  createRunnerSearch,
  McpStdioConnectorFactory,
  nodeLaunchFolders,
  nodeProgramStarter,
} from "@halonicjs/adapter-mcp";
import { MemoryTokenStore } from "@halonicjs/adapter-memory";
import type { ConnectorFactory, HttpClient, Sandbox, TokenStore } from "@halonicjs/ports";
import type { ConnectorRouteDeps } from "./connector-routes.ts";
import { ConnectorTable } from "./connector-table.ts";
import { NoInheritedEnvFactory } from "./no-inherited-env-factory.ts";

/** How long one connector's session may last: a run's connectors end with the run, so this only bounds a stuck one. */
const connectorSessionLimitMs = 24 * 60 * 60_000;
/** How long one connector call may take. */
const connectorCallLimitMs = 5 * 60_000;

/** What the host builds its connector factory from. */
export interface HostConnectorOptions {
  /** The host's own sandbox: its check decides, at each start, between a fenced session and today's start. */
  sandbox: Pick<Sandbox, "check" | "open">;
  version: string;
  /** What a connector's program may never reach: Halonic's own data, the profile folder. */
  deniedPaths: readonly string[];
  /** The host's own environment, which a program inherits from by name and which finds a pinned package's runner. */
  env: Readonly<Record<string, string | undefined>>;
}

/**
 * The factory behind the connector routes: the CLI's wiring (`connector-machine.ts`)
 * for one `stdio` factory, in the host. The program, its sandbox session and
 * its MCP client all live here; Studio's page has none of them.
 */
export function hostConnectorFactory(options: HostConnectorOptions): ConnectorFactory {
  const clientInfo = { name: "halonic", version: options.version };
  const runners = createRunnerSearch(options.env);
  // The caller picks no variable of the host's environment for its program, fenced or not.
  const unfenced = new NoInheritedEnvFactory(
    new McpStdioConnectorFactory({
      starter: nodeProgramStarter,
      folders: nodeLaunchFolders,
      runners,
      inheritedEnv: options.env,
      clientInfo,
    }),
  );
  return new SessionWorkspaceFactory({
    sandbox: options.sandbox,
    sandboxed: (setupOf) =>
      new SandboxStdioConnectorFactory({
        clientInfo,
        localTools: () => undefined,
        workspaceConnectors: setupOf,
        // A blocked access reaches Studio through the session's own stream, not a connector.
        onBlocked: () => undefined,
        onUndeclaredTool: () => undefined,
      }),
    unfenced,
    folders: nodeLaunchFolders,
    runners,
    deniedPaths: options.deniedPaths,
    path: options.env["PATH"] ?? "",
    timeLimitMs: connectorSessionLimitMs,
    callTimeoutMs: connectorCallLimitMs,
  });
}

/**
 * What the connector routes reach on this host.
 *
 * @param workspaceRoots - the folders the launcher named as workspaces
 */
export function hostConnectorRoutes(
  options: HostConnectorOptions,
  workspaceRoots: readonly string[],
  connectors: ConnectorTable = new ConnectorTable(),
): ConnectorRouteDeps {
  const http: HttpClient = createNodeHttpClient({ hostClass: () => "public" });
  // A `stdio` connector reads no sign-in token.
  const tokens: TokenStore = new MemoryTokenStore();
  return { factory: hostConnectorFactory(options), connectors, workspaceRoots, http, tokens };
}
