import {
  openPluginBackend,
  type PluginBackendMachine,
  PluginBackendNotFencedError,
  RunnerToolError,
} from "@halonicjs/adapter-integration-runner";
import {
  openPluginConnector,
  PluginBackendNotTrustedError,
  PluginConnectorNotTrustedError,
  type PluginConnectorSources,
  type PluginPartUnavailable,
  pluginPartUnavailableReason,
  pluginSecretNames,
  readPluginFolder,
} from "@halonicjs/app";
import type { Plugin } from "@halonicjs/format";
import {
  type ConnectorCallOptions,
  type ConnectorClient,
  type ConnectorFactoryContext,
  type ConnectorTool,
  isConnectorToolError,
  type SignInTokens,
} from "@halonicjs/ports";
import { findCause } from "@halonicjs/std";
import { PluginRefusal } from "./plugin-refusal.ts";
import { pluginIdPattern } from "./plugin-schemas.ts";
import type { PluginBackends } from "./plugin-table.ts";

/** What a plugin's backend may use: the context of every backend, and the access tokens of its own sign-ins. */
export interface HostPluginContext extends ConnectorFactoryContext {
  /** The host's sign-in tokens for `plugin`, or `undefined` where the host runs no sign-ins. */
  signInTokens(plugin: string): SignInTokens | undefined;
}

/**
 * The host's {@link PluginBackends} on this computer: the plugin's connector
 * the CLI opens too (`openPluginConnector`), so a plugin's tools run exactly
 * as they do for `halonic run`. Its backend starts in the runner, behind the
 * trust check and the start gate (`openPluginBackend`); each local tool starts
 * in a sandbox session of its own, from a copy of the files the person
 * trusted (`localTools`). Nothing here loads a plugin's code.
 *
 * @param machine - what a backend's start uses; its gate allows a run without the sandbox only with the user's saved yes for the reason at that start. A local tool never runs without it
 * @param context - the secrets, tokens and sign-in tokens a plugin may use
 * @param localTools - each connector's local tools, with a new session setup (`pluginLocalToolsSource`)
 * @param log - where the detail of a refusal goes; the answer carries a fixed message only
 */
export function hostPluginBackends(
  machine: PluginBackendMachine,
  context: HostPluginContext,
  localTools: PluginConnectorSources["localTools"],
  log: (text: string) => void = () => undefined,
): PluginBackends {
  const openBackend = openPluginBackend(machine);
  const startTrust = { plugins: machine.plugins, digest: machine.digest, trust: machine.trust };
  const sourcesFor = (plugin: string, fingerprint: string): PluginConnectorSources => {
    const signInTokens = context.signInTokens(plugin);
    return {
      startTrust,
      // The backend starts only under the fingerprint the call checked, so a plugin swapped in since never runs.
      // Only the backend gets the plugin's sign-in tokens; a local tool gets its secrets and settings alone.
      openBackend: (request) =>
        openBackend({
          ...request,
          fingerprint,
          ...(signInTokens === undefined ? {} : { signInTokens }),
        }),
      localTools,
      onUnavailable: (_connector, unavailable) => log(partOffLine(unavailable)),
    };
  };
  return {
    trustedFingerprint: async (plugin) => (await trustedPlugin(machine, plugin, log)).fingerprint,
    trustedSecretNames: async (plugin) =>
      pluginSecretNames((await trustedPlugin(machine, plugin, log)).plugin),
    open: async (plugin, fingerprint): Promise<ConnectorClient> => {
      const now = await trustedPlugin(machine, plugin, log);
      if (now.fingerprint !== fingerprint) throw new PluginRefusal("plugin_not_trusted");
      const connector = openPluginConnector(
        sourcesFor(plugin, fingerprint),
        { id: plugin, plugin },
        context,
      );
      return new RefusingConnector(connector, log);
    },
    // A tool's own error, from the backend or a local tool, leaves the plugin's parts running.
    runnerSurvives: (error) => error instanceof RunnerToolError || isConnectorToolError(error),
  };
}

/**
 * A plugin's connector whose start failures are the host's refusals: a part
 * opens on its first call, so a refusal comes from the call, not the open.
 */
class RefusingConnector implements ConnectorClient {
  readonly id: string;
  readonly #connector: ConnectorClient;
  readonly #log: (text: string) => void;

  constructor(connector: ConnectorClient, log: (text: string) => void) {
    this.id = connector.id;
    this.#connector = connector;
    this.#log = log;
  }

  async listTools(): Promise<ConnectorTool[]> {
    return await this.#refusing(() => this.#connector.listTools());
  }

  async callTool(
    name: string,
    args: Record<string, unknown>,
    options?: ConnectorCallOptions,
  ): Promise<string> {
    return await this.#refusing(() => this.#connector.callTool(name, args, options));
  }

  async close(): Promise<void> {
    await this.#connector.close();
  }

  async #refusing<T>(use: () => Promise<T>): Promise<T> {
    try {
      return await use();
    } catch (error) {
      throw refusalFor(error, this.#log) ?? error;
    }
  }
}

/**
 * Reads the plugin's folder and checks the trust record against it, now.
 * Only a plugin id of the allow-list reaches the disk.
 *
 * @returns the manifest as read, and the fingerprint the trust covers
 * @throws PluginRefusal `plugin_not_trusted` when the trust doesn't cover the plugin, or it has no backend
 */
export async function trustedPlugin(
  machine: PluginBackendMachine,
  plugin: string,
  log: (text: string) => void,
): Promise<{ plugin: Plugin; fingerprint: string }> {
  if (!pluginIdPattern.test(plugin)) throw new PluginRefusal("plugin_not_trusted");
  const read = await readPluginFolder(machine.plugins, machine.digest, plugin).catch(
    (error: unknown) => {
      log(`A plugin's folder couldn't be read (${errorName(error)})\n`);
      throw new PluginRefusal("plugin_not_trusted");
    },
  );
  if (!read.ok || !declaresTools(read.value.plugin)) {
    throw new PluginRefusal("plugin_not_trusted");
  }
  const { location, plugin: found, files } = read.value;
  const check = await machine.trust.checkPlugin({ location, plugin: found, files });
  // Anything but `trusted` refuses, so a status added later fails closed.
  if (check.status !== "trusted") throw new PluginRefusal("plugin_not_trusted");
  return { plugin: found, fingerprint: check.fingerprint };
}

/** Whether a part of the plugin, its backend or a local tool, declares a tool Studio could call. */
function declaresTools(plugin: Plugin): boolean {
  const backendTools = plugin.backend?.tools.length ?? 0;
  return backendTools > 0 || (plugin.localTools ?? []).some((tool) => tool.tools.length > 0);
}

/**
 * The refusal an error from a part's start stands for, or `undefined` when it
 * is a failure of the plugin, the runner or a setting with no value. A local
 * tool this computer can't fence is `not_fenced`, as a backend is; the
 * connector already logged why (`partOffLine`).
 */
function refusalFor(error: unknown, log: (text: string) => void): PluginRefusal | undefined {
  const notFenced = findCause(error, PluginBackendNotFencedError);
  if (notFenced !== undefined) {
    log(`A plugin didn't start: no sandbox fences it (${notFenced.reason}).\n`);
    return new PluginRefusal("not_fenced");
  }
  if (
    findCause(error, PluginBackendNotTrustedError) !== undefined ||
    findCause(error, PluginConnectorNotTrustedError) !== undefined
  ) {
    return new PluginRefusal("plugin_not_trusted");
  }
  switch (pluginPartUnavailableReason(error).kind) {
    case "not-trusted":
      return new PluginRefusal("plugin_not_trusted");
    case "needs-desktop-app":
    case "sandbox-unavailable":
    case "sandbox-not-fenced":
    case "network-needs-srt":
      return new PluginRefusal("not_fenced");
    case "settings-not-set":
    case "failed":
      return undefined;
  }
}

/** The host's log line for a part of a plugin that can't start: ids and a code, never the error's text. */
function partOffLine(unavailable: PluginPartUnavailable): string {
  return `A part of the plugin ${unavailable.plugin} can't start (${unavailable.part}): ${unavailable.reason.kind}.\n`;
}

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : "Error";
}

/**
 * The backends of the shipped single executable: every call is refused. In
 * it `process.execPath` is the host itself, not Node, so a runner start would
 * fail or start a second host without the Node permission layer. Replaced
 * once the executable has a runner mode of its own.
 */
export function unavailablePluginBackends(): PluginBackends {
  const refuse = async (): Promise<never> => {
    throw new PluginRefusal("not_in_this_build");
  };
  return {
    trustedFingerprint: refuse,
    trustedSecretNames: refuse,
    open: refuse,
    runnerSurvives: () => false,
  };
}
