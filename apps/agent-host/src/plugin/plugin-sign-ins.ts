import type { PluginBackendMachine } from "@halonicjs/adapter-integration-runner";
import { pluginBackendChoices } from "@halonicjs/app";
import { backendSheet } from "@halonicjs/format";
import type { SignInIntegration } from "@halonicjs/host-integration-sign-in";
import type { Secrets } from "@halonicjs/ports";
import { signInIntegration } from "../sign-in/app-sign-in-integration.ts";
import { trustedPlugin } from "./host-plugin-backends.ts";
import { PluginRefusal } from "./plugin-refusal.ts";
import { pluginIdPattern } from "./plugin-schemas.ts";

/** What {@link pluginSignIns} reads a plugin from. */
export interface PluginSignInsOptions {
  /** The profile's plugins folder, the trust and the saved settings, as a backend's start reads them. */
  readonly machine: PluginBackendMachine;
  /** The secrets Studio handed over; only the plugin's own are read, by the names its manifest gives. */
  readonly secrets: Secrets;
  /** Where the detail of a refusal goes. */
  readonly log?: (text: string) => void;
}

/**
 * The sign-ins of the host's plugins, as the host's sign-ins ask for them: by
 * the plugin's id, which is the integration's name and its backend sheet's id.
 *
 * Nothing is kept. Every read takes the plugin's folder and checks the trust
 * against it again, as a backend's start does, so a plugin that changed or
 * lost its trust gives no sheet and no client secret: its sign-ins fail
 * closed (`sign_in_failed`) until it is trusted again. The sheet, settings
 * and secret names are the ones a backend's start loads it with
 * (`pluginBackendChoices`), and the client secret is read only from the
 * plugin's own handed-over secrets.
 *
 * @returns for a plugin id, its sign-ins; `undefined` for a name that can't be a plugin's id
 *
 * @example
 * openHostSignIns({ profile, env, integration: pluginSignIns({ machine, secrets }), ownPorts });
 */
export function pluginSignIns(
  options: PluginSignInsOptions,
): (name: string) => SignInIntegration | undefined {
  const { machine, secrets, log = () => undefined } = options;
  return (name) => {
    if (!pluginIdPattern.test(name)) return undefined;
    return signInIntegration(secrets, {
      plugin: name,
      read: async () => {
        const { plugin } = await trustedPlugin(machine, name, log);
        const sheet = backendSheet(plugin);
        // `trustedPlugin` refuses a plugin without a backend, so this is only a guard.
        if (sheet === undefined) throw new PluginRefusal("plugin_not_trusted");
        return { sheet, choices: pluginBackendChoices(plugin, await machine.settings(plugin)) };
      },
    });
  };
}
