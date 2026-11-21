// Opens the connector of a plugin a workspace names as
// `transport: { plugin: { id } }`, as `app.plugin-connector-opening` asks
// (HAL-12343, PR 4c). The CLI and the desktop agent host both use it, so a
// plugin's parts start the same way in each.
//
// Nothing opens until the connector's first use. Then the plugin is read
// and its trust checked once, to learn its parts and its grant; each part
// still checks again before it starts (`app.plugin-backend`,
// `app.plugin-local-tools`). Every connector gets local tools of its own,
// so two runs never share a session's setup.

import type {
  ConnectorCallOptions,
  ConnectorClient,
  ConnectorFactoryContext,
  ConnectorPartOff,
  ConnectorTool,
  TrustGrant,
} from "@halonicjs/ports";
import {
  PluginConnector,
  type PluginConnectorPart,
  type PluginPartUnavailable,
} from "./plugin-connector.ts";
import type { PluginProblem } from "./plugin-folder.ts";
import type { LocalToolSet, PluginLocalTools } from "./plugin-local-tools.ts";
import {
  checkPluginTrustNow,
  type PluginStartTrustOptions,
  type PluginStartTrustReason,
  type TrustedPluginFolder,
} from "./plugin-start-trust.ts";

/** What opening a plugin's backend is asked for. */
export interface PluginBackendRequest {
  /** The connector's id in the workspace. */
  readonly id: string;
  /** The plugin's id. */
  readonly plugin: string;
  readonly context: ConnectorFactoryContext;
  /** The fingerprint the connector found trusted; the backend refuses to start a plugin that no longer has it. */
  readonly fingerprint: string;
}

/** What {@link openPluginConnector} needs from the host. */
export interface PluginConnectorSources {
  /** Where the connector reads the plugin and checks the person's trust in it. */
  readonly startTrust: PluginStartTrustOptions;
  /** Opens the plugin's backend on its first use, behind its own trust check and start gate. */
  openBackend(request: PluginBackendRequest): Promise<ConnectorClient>;
  /**
   * The local tools of one connector, given that connector's context. Make a
   * new one, with a new session setup, at every call. Called when the
   * connector first opens, so the host may look up what it needs then.
   */
  localTools(
    context: Omit<ConnectorFactoryContext, "trust" | "sandbox">,
  ): Promise<PluginLocalTools>;
  /** Told once for each part of the connector that can't start, so the host can say which and why. */
  onUnavailable?(connector: string, unavailable: PluginPartUnavailable): void;
}

/** A plugin's connector didn't open, because the person's trust doesn't cover what is in its folder now. Nothing started. */
export class PluginConnectorNotTrustedError extends Error {
  override readonly name = "PluginConnectorNotTrustedError";
  readonly plugin: string;
  readonly reason: PluginStartTrustReason;
  /** For `unreadable`, what is wrong with the folder; otherwise empty. */
  readonly problems: readonly PluginProblem[];

  constructor(plugin: string, reason: PluginStartTrustReason, problems: readonly PluginProblem[]) {
    super(notTrustedMessage(plugin, reason, problems));
    this.plugin = plugin;
    this.reason = reason;
    this.problems = problems;
  }
}

/**
 * The connector `id` for the plugin `plugin`: the tools of its backend and of
 * each local tool, as {@link PluginConnector} joins them.
 *
 * @example
 * const client = openPluginConnector(sources, { id: "weather", plugin: "weather" }, context);
 */
export function openPluginConnector(
  sources: PluginConnectorSources,
  names: { readonly id: string; readonly plugin: string },
  context: ConnectorFactoryContext,
): ConnectorClient {
  return new LazyPluginConnector(names.id, async () => {
    const trusted = await trustedNow(sources.startTrust, names.plugin);
    const grant: TrustGrant = { location: trusted.location, fingerprint: trusted.fingerprint };
    return new PluginConnector({
      id: names.id,
      plugin: names.plugin,
      parts: await pluginParts(sources, names, context, trusted, grant),
      onUnavailable: (unavailable) => sources.onUnavailable?.(names.id, unavailable),
    });
  });
}

async function trustedNow(
  startTrust: PluginStartTrustOptions,
  plugin: string,
): Promise<TrustedPluginFolder> {
  const checked = await checkPluginTrustNow(startTrust, plugin);
  if (!checked.ok) {
    throw new PluginConnectorNotTrustedError(plugin, checked.error.reason, checked.error.problems);
  }
  return checked.value;
}

/** The parts that declare tools: the backend first, then the local tools in manifest order. */
async function pluginParts(
  sources: PluginConnectorSources,
  names: { readonly id: string; readonly plugin: string },
  context: ConnectorFactoryContext,
  trusted: TrustedPluginFolder,
  grant: TrustGrant,
): Promise<PluginConnectorPart[]> {
  const { plugin } = trusted;
  const parts: PluginConnectorPart[] = [];
  const backendTools = plugin.backend?.tools ?? [];
  if (backendTools.length > 0) {
    parts.push({
      part: "backend",
      declared: backendTools.map((tool) => tool.name),
      client: new LazyPluginConnector(names.id, () =>
        sources.openBackend({ ...names, context, fingerprint: grant.fingerprint }),
      ),
    });
  }
  const localTools = (plugin.localTools ?? []).filter((tool) => tool.tools.length > 0);
  if (localTools.length > 0) {
    const { trust: _trust, sandbox: _sandbox, ...shared } = context;
    const local = await sources.localTools(shared);
    for (const tool of localTools) {
      const set: LocalToolSet = {
        plugin: plugin.id,
        part: `local:${tool.id}`,
        declared: tool.tools,
        trust: grant,
      };
      parts.push({
        part: set.part,
        declared: tool.tools.map((declared) => declared.name),
        client: local.connector(set),
      });
    }
  }
  return parts;
}

/**
 * A client that opens its connector on first use. An open that fails is
 * tried again, with its checks, on the next use; its error names the
 * connector and keeps the reason as its `cause`.
 */
class LazyPluginConnector implements ConnectorClient {
  readonly id: string;
  readonly #open: () => Promise<ConnectorClient>;
  #opened: Promise<ConnectorClient> | undefined;
  /** The connector once it opened, for the calls that can't wait for it. */
  #current: ConnectorClient | undefined;
  #closed = false;

  constructor(id: string, open: () => Promise<ConnectorClient>) {
    this.id = id;
    this.#open = open;
  }

  async listTools(): Promise<ConnectorTool[]> {
    return await (await this.#client()).listTools();
  }

  async callTool(
    name: string,
    args: Record<string, unknown>,
    options?: ConnectorCallOptions,
  ): Promise<string> {
    return await (await this.#client()).callTool(name, args, options);
  }

  /** The opened connector's parts found off since the last call; none before it opened. */
  newPartsOff(): readonly ConnectorPartOff[] {
    return this.#current?.newPartsOff?.() ?? [];
  }

  /** Closes the connector if it opened. Closing one that was never used opens nothing. */
  async close(): Promise<void> {
    this.#closed = true;
    const opened = this.#opened;
    this.#opened = undefined;
    this.#current = undefined;
    await (await opened?.catch(() => undefined))?.close();
  }

  async #client(): Promise<ConnectorClient> {
    if (this.#closed) throw new Error(`Connector "${this.id}": its connection is closed.`);
    this.#opened ??= this.#open();
    const opening = this.#opened;
    try {
      const client = await opening;
      if (!this.#closed) this.#current = client;
      return client;
    } catch (error) {
      if (this.#opened === opening) this.#opened = undefined;
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(`Connector "${this.id}" didn't start: ${reason}`, { cause: error });
    }
  }
}

function notTrustedMessage(
  plugin: string,
  reason: PluginStartTrustReason,
  problems: readonly PluginProblem[],
): string {
  switch (reason) {
    case "unreadable":
      return `The plugin ${plugin} doesn't open: ${problems.map((problem) => problem.message).join(" ")}`;
    case "not-trusted":
      return `The plugin ${plugin} runs a program, so it opens only once you trust it. Review and trust it with halonic trust --plugin ${plugin}.`;
    case "changed":
      return `The plugin ${plugin} changed since you trusted it, so it doesn't open. Review what changed and trust it again with halonic trust --plugin ${plugin}.`;
    case "record-unreadable":
      return `The plugin ${plugin} doesn't open: Halonic can't read its trust record. Trust it again with halonic trust --plugin ${plugin}, which writes the record again.`;
    case "not-checked":
      return `The plugin ${plugin} doesn't open: Halonic couldn't check whether you trust it. See where it stands with halonic plugin list.`;
  }
}
