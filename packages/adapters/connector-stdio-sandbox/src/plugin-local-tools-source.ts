// The local tools of each plugin connector, the same way in the CLI and the
// desktop agent host (HAL-12343, PR 4d). Every connector gets a new
// `PluginLocalToolSessions`, so two runs, or two plugins, never share a
// session's setup; each session runs only in the sandbox session it is given.

import type { LaunchFolders, RunnerSearch } from "@halonicjs/adapter-mcp";
import {
  type PluginConnectorSources,
  PluginLocalTools,
  type PluginSettingValues,
  type PluginStartTrustOptions,
} from "@halonicjs/app";
import type { Plugin } from "@halonicjs/format";
import type { Sandbox } from "@halonicjs/ports";
import type { LocalToolPlace } from "./local-tool-launch.ts";
import { PluginLocalToolSessions } from "./plugin-local-tool-sessions.ts";
import { SandboxStdioConnectorFactory } from "./sandbox-connector.ts";

/** What the host gives every plugin connector's local tools. */
export interface PluginLocalToolsHost {
  /** The sandbox each local tool's session opens in. */
  readonly sandbox: Pick<Sandbox, "check" | "open">;
  /** Where each session's folders are made, one new folder each. */
  readonly folders: LaunchFolders;
  /** Where a pinned package's runner is looked for. */
  readonly runners: RunnerSearch;
  /**
   * What a local tool's program may never reach: the person's credential
   * folders and Halonic's profile, each at its real place. Looked up again
   * for each session, as a credential folder may appear while the host runs.
   */
  deniedPaths(): Promise<readonly string[]>;
  /** The Halonic bridge, or `null` for none. */
  readonly bridge: LocalToolPlace["bridge"];
  /** The `PATH` the program gets: the host's own. */
  readonly path: string;
  /** How long one session may last, in milliseconds. */
  readonly timeLimitMs: number;
  /** The client name and version a local tool's MCP server is told. */
  readonly clientInfo: { readonly name: string; readonly version: string };
  /** Where each start reads the plugin again and checks the person's trust in it. */
  readonly startTrust: PluginStartTrustOptions;
  /** The plugin's setting values, as `PluginSettings.values` gives them. */
  settings(plugin: Plugin): Promise<PluginSettingValues>;
  /** Told when a session's folders couldn't be removed; nothing tries again. */
  onReleaseFailed(error: unknown): void;
}

/**
 * The `localTools` of `PluginConnectorSources`: a new {@link PluginLocalTools}
 * with a new session setup at every call.
 *
 * @example
 * const sources = { startTrust, openBackend, localTools: pluginLocalToolsSource(host) };
 */
export function pluginLocalToolsSource(
  host: PluginLocalToolsHost,
): PluginConnectorSources["localTools"] {
  return async (context) => {
    const sessions = new PluginLocalToolSessions({
      folders: host.folders,
      runners: host.runners,
      deniedPaths: () => host.deniedPaths(),
      bridge: host.bridge,
      path: host.path,
      timeLimitMs: host.timeLimitMs,
      http: context.http,
      secrets: context.secrets,
      settings: (plugin) => host.settings(plugin),
    });
    return new PluginLocalTools({
      sandbox: host.sandbox,
      factory: new SandboxStdioConnectorFactory({
        clientInfo: { ...host.clientInfo },
        localTools: sessions.localTools,
        // A blocked access reaches the person through the host's own events, not from a connector.
        onBlocked: () => undefined,
        onUndeclaredTool: () => undefined,
      }),
      context,
      startTrust: host.startTrust,
      prepare: async (set, trusted) => {
        const opening = await sessions.prepare(set, trusted);
        return { ...opening, release: () => releaseTold(opening.release, host) };
      },
    });
  };
}

/** Removes a session's folders, telling the host when that fails, as `PluginLocalTools` ignores the failure. */
async function releaseTold(
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
