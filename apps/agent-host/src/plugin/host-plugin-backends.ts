import {
  openPluginBackend,
  type PluginBackendMachine,
  PluginBackendNotFencedError,
  RunnerToolError,
} from "@halonicjs/adapter-integration-runner";
import { PluginBackendNotTrustedError, pluginSecretNames, readPluginFolder } from "@halonicjs/app";
import type { Plugin } from "@halonicjs/format";
import type { ConnectorClient, ConnectorFactoryContext } from "@halonicjs/ports";
import { PluginRefusal } from "./plugin-refusal.ts";
import { pluginIdPattern } from "./plugin-schemas.ts";
import type { PluginBackends } from "./plugin-table.ts";

/**
 * The host's {@link PluginBackends} on this computer: the CLI's own opener
 * (`openPluginBackend`), so a plugin's backend starts exactly as it does for
 * `halonic run`, behind the trust check and the start gate. Nothing here
 * loads a plugin's code: it runs only in the runner the gate started.
 *
 * @param machine - what a start uses; its gate allows a run without the sandbox only with the user's saved yes for the reason at that start
 * @param context - the secrets and tokens a backend may use
 * @param log - where the detail of a refusal goes; the answer carries a fixed message only
 */
export function hostPluginBackends(
  machine: PluginBackendMachine,
  context: ConnectorFactoryContext,
  log: (text: string) => void = () => undefined,
): PluginBackends {
  const open = openPluginBackend(machine);
  return {
    trustedFingerprint: async (plugin) => (await trustedPlugin(machine, plugin, log)).fingerprint,
    trustedSecretNames: async (plugin) =>
      pluginSecretNames((await trustedPlugin(machine, plugin, log)).plugin),
    open: async (plugin, fingerprint): Promise<ConnectorClient> => {
      try {
        return await open({ id: plugin, plugin, context, fingerprint });
      } catch (error) {
        throw refusalFor(error, log) ?? error;
      }
    },
    runnerSurvives: (error) => error instanceof RunnerToolError,
  };
}

/**
 * Reads the plugin's folder and checks the trust record against it, now.
 * Only a plugin id of the allow-list reaches the disk.
 *
 * @returns the manifest as read, and the fingerprint the trust covers
 */
async function trustedPlugin(
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
  if (!read.ok || read.value.plugin.backend === undefined) {
    throw new PluginRefusal("plugin_not_trusted");
  }
  const { location, plugin: found, files } = read.value;
  const check = await machine.trust.checkPlugin({ location, plugin: found, files });
  // Anything but `trusted` refuses, so a status added later fails closed.
  if (check.status !== "trusted") throw new PluginRefusal("plugin_not_trusted");
  return { plugin: found, fingerprint: check.fingerprint };
}

/** The refusal an error from the start stands for, or `undefined` when it is a failure of the plugin or the runner. */
function refusalFor(error: unknown, log: (text: string) => void): PluginRefusal | undefined {
  if (error instanceof PluginBackendNotFencedError) {
    log(`A plugin didn't start: no sandbox fences it (${error.reason}).\n`);
    return new PluginRefusal("not_fenced");
  }
  if (error instanceof PluginBackendNotTrustedError) return new PluginRefusal("plugin_not_trusted");
  return undefined;
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
