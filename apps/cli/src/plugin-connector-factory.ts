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
import {
  PluginLocalToolSessions,
  SandboxStdioConnectorFactory,
} from "@halonicjs/adapter-connector-stdio-sandbox";
import { homeDeniedGroups, realPathOnDisk } from "@halonicjs/adapter-harness-kit";
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
  PluginLocalTools,
  type PluginPartUnavailable,
} from "@halonicjs/app";
import type {
  ConnectorClient,
  ConnectorConfig,
  ConnectorFactory,
  ConnectorFactoryContext,
  Sandbox,
} from "@halonicjs/ports";

export type { OpenPluginBackend, OpenPluginBackendRequest };

/**
 * Serves `plugin` connectors. Nothing starts when the run only holds the
 * connector: the backend starts at the first call that needs it, and each
 * local tool's session at the first call that needs that tool. Each stops
 * when the client closes.
 *
 * @example
 * new ConnectorFactories([stdioFactory, httpFactory, new PluginConnectorFactory(sources)]);
 */
export class PluginConnectorFactory implements ConnectorFactory {
  readonly transport = "plugin";
  readonly #sources: PluginConnectorSources;

  constructor(sources: PluginConnectorSources) {
    this.#sources = sources;
  }

  create(config: ConnectorConfig, context: ConnectorFactoryContext): ConnectorClient {
    const { transport } = config;
    if (transport.kind !== "plugin") {
      throw new Error(`Connector "${config.id}" isn't a plugin's backend.`);
    }
    return openPluginConnector(this.#sources, { id: config.id, plugin: transport.id }, context);
  }
}

/** What the CLI's plugin connectors use on this computer, besides the backend's machine. */
export interface PluginLocalToolsHost {
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
 * share one.
 */
export function pluginConnectorSources(
  machine: PluginBackendMachine,
  host: PluginLocalToolsHost,
  clientInfo: ClientInfo,
): PluginConnectorSources {
  const startTrust = { plugins: machine.plugins, digest: machine.digest, trust: machine.trust };
  const openBackend = openPluginBackend(machine);
  return {
    startTrust,
    // Not pinned to the fingerprint the connector found: a connector lasts the whole run, and the
    // backend checks the trust again at every start, refusing a plugin changed since the run began
    // with "Start the run again" rather than asking for a trust the person already gave.
    openBackend: ({ fingerprint: _found, ...request }) => openBackend(request),
    localTools: async (context) => {
      const sessions = new PluginLocalToolSessions({
        folders: host.folders ?? nodeLaunchFolders,
        runners: createRunnerSearch(host.env),
        deniedPaths: await localToolDeniedPaths(host),
        // The CLI gives a local tool no Halonic bridge yet.
        bridge: null,
        path: host.env["PATH"] ?? "",
        timeLimitMs: host.timeLimitMs,
        http: context.http,
        secrets: context.secrets,
        settings: (plugin) => machine.settings(plugin),
      });
      return new PluginLocalTools({
        sandbox: host.sandbox,
        factory: new SandboxStdioConnectorFactory({
          clientInfo: { ...clientInfo },
          localTools: sessions.localTools,
          // The CLI shows a blocked access in the run's own events, not from a connector.
          onBlocked: () => undefined,
          onUndeclaredTool: () => undefined,
        }),
        context,
        startTrust,
        prepare: async (set, trusted) => {
          const opening = await sessions.prepare(set, trusted);
          return { ...opening, release: () => releaseLogged(opening.release, host) };
        },
      });
    },
    onUnavailable: (connector, unavailable) => host.onUnavailable(connector, unavailable),
  };
}

/** Halonic's profile and the person's credential folders, such as SSH keys, each at its real place. */
async function localToolDeniedPaths(host: PluginLocalToolsHost): Promise<string[]> {
  const groups = await homeDeniedGroups(host.home ?? homedir(), process.platform, {
    realPath: realPathOnDisk,
  });
  return [...new Set([...host.deniedPaths, ...groups.flatMap((group) => group.paths)])];
}

/** Removes a session's folders, telling the host when that fails, as `PluginLocalTools` ignores the failure. */
async function releaseLogged(
  release: (() => Promise<void>) | undefined,
  host: Pick<PluginLocalToolsHost, "onReleaseFailed">,
): Promise<void> {
  try {
    await release?.();
  } catch (error) {
    host.onReleaseFailed(error);
    throw error;
  }
}
