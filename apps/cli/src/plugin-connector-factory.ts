// The CLI's connector factory for the `plugin` transport (HAL-8089, HAL-12343):
// a trusted plugin's tools offered to a run like any other connector's, from
// its backend and from each of its local tools (`openPluginConnector`).
//
// The backend starts the way a local integration does: in the runner, on
// its first use, behind its trust check and start gate (`openPluginBackend`).
// Each local tool starts in a sandbox session of its own, from a copy of the
// files the person trusted (`PluginLocalToolSessions`). A part that can't
// start leaves out only its own tools, and the run says which and why.

import { homedir } from "node:os";
import { pluginLocalToolsSource } from "@halonicjs/adapter-connector-stdio-sandbox";
import { homeDeniedPaths, realPathOnDisk } from "@halonicjs/adapter-harness-kit";
import {
  type OpenPluginBackend,
  type OpenPluginBackendRequest,
  openPluginBackend,
  type PluginBackendMachine,
} from "@halonicjs/adapter-integration-runner";
import { createRunnerSearch, type LaunchFolders, nodeLaunchFolders } from "@halonicjs/adapter-mcp";
import {
  openPluginConnector,
  type PluginConnectorSources,
  type PluginPartUnavailable,
} from "@halonicjs/app";
import {
  type ConnectorClient,
  type ConnectorConfig,
  type ConnectorFactory,
  type ConnectorFactoryContext,
  pluginSecrets,
  type Sandbox,
  type Secrets,
} from "@halonicjs/ports";

export type { OpenPluginBackend, OpenPluginBackendRequest };

/**
 * Serves `plugin` connectors. Nothing starts when the run only holds the
 * connector: the backend starts at the first call that needs it, and each
 * local tool's session at the first call that needs that tool. Each stops
 * when the client closes.
 *
 * A run gives every factory the secrets as a workspace may pick them
 * (`workspaceSecrets`), which refuse every plugin's name. So a plugin's
 * connector reads from `secrets`, the store itself, and only that plugin's
 * own names in it (`pluginSecrets`), never the run's view (HAL-15079).
 *
 * @example
 * new ConnectorFactories([stdioFactory, httpFactory, new PluginConnectorFactory(sources, secrets)]);
 */
export class PluginConnectorFactory implements ConnectorFactory {
  readonly transport = "plugin";
  readonly #sources: PluginConnectorSources;
  readonly #secrets: Secrets;

  constructor(sources: PluginConnectorSources, secrets: Secrets) {
    this.#sources = sources;
    this.#secrets = secrets;
  }

  create(config: ConnectorConfig, context: ConnectorFactoryContext): ConnectorClient {
    const { transport } = config;
    if (transport.kind !== "plugin") {
      throw new Error(`Connector "${config.id}" isn't a plugin's backend.`);
    }
    const own = { ...context, secrets: pluginSecrets(this.#secrets, transport.id) };
    return openPluginConnector(this.#sources, { id: config.id, plugin: transport.id }, own);
  }
}

/** What the CLI's plugin connectors use on this computer, besides the backend's machine. */
export interface CliPluginHost {
  /** The sandbox each local tool's session opens in. */
  readonly sandbox: Pick<Sandbox, "check" | "open">;
  /** What a local tool's program may never reach besides the person's credential folders: Halonic's profile. */
  readonly deniedPaths: readonly string[];
  /** The environment a pinned package's runner is found in, and whose `PATH` the program gets. */
  readonly env: Readonly<Record<string, string | undefined>>;
  /** The person's home folder, whose credential folders the program may never reach; `os.homedir()` unless given. */
  readonly home?: string;
  /** Where each session's folders are made; new temp folders unless given. */
  readonly folders?: LaunchFolders;
  /** How long one local tool's session may last, in milliseconds. */
  readonly timeLimitMs: number;
  /** Told once for each part of a plugin's connector that can't start. */
  onUnavailable(connector: string, unavailable: PluginPartUnavailable): void;
  /** Told when a session's folders couldn't be removed; nothing tries again. */
  onReleaseFailed(error: unknown): void;
}

/** The client name and version a local tool's MCP server is told. */
type ClientInfo = { readonly name: string; readonly version: string };

/**
 * The sources a {@link PluginConnectorFactory} opens plugins from on this
 * computer: the backend through `openPluginBackend`, and each connector's
 * local tools with a new session setup of their own, so two runs never
 * share one (`pluginLocalToolsSource`).
 */
export function pluginConnectorSources(
  machine: PluginBackendMachine,
  host: CliPluginHost,
  clientInfo: ClientInfo,
): PluginConnectorSources {
  const startTrust = { plugins: machine.plugins, digest: machine.digest, trust: machine.trust };
  const openBackend = openPluginBackend(machine);
  const home = host.home ?? homedir();
  return {
    startTrust,
    // Not pinned to the fingerprint the connector found: a connector lasts the whole run, and the
    // backend checks the trust again at every start, refusing a plugin changed since the run began
    // with "Start the run again" rather than asking for a trust the person already gave.
    openBackend: ({ fingerprint: _found, ...request }) => openBackend(request),
    localTools: pluginLocalToolsSource({
      sandbox: host.sandbox,
      folders: host.folders ?? nodeLaunchFolders,
      runners: createRunnerSearch(host.env),
      deniedPaths: async () => [
        ...host.deniedPaths,
        ...(await homeDeniedPaths(home, process.platform, { realPath: realPathOnDisk })),
      ],
      // The CLI gives a local tool no Halonic bridge yet.
      bridge: null,
      path: host.env["PATH"] ?? "",
      timeLimitMs: host.timeLimitMs,
      clientInfo,
      startTrust,
      settings: (plugin) => machine.settings(plugin),
      onReleaseFailed: (error) => host.onReleaseFailed(error),
    }),
    onUnavailable: (connector, unavailable) => host.onUnavailable(connector, unavailable),
  };
}
