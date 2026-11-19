import {
  type PluginDeclaredHost,
  pluginClientSecretHosts,
  pluginClientSecretNames,
} from "@halonicjs/app";
import type { Plugin } from "@halonicjs/format";

/** A host as a sheet writes it: fixed, or read from a setting. */
export type DeclaredHost = PluginDeclaredHost;

/**
 * Where a sign-in's client secret may go: the hosts of the token URL and the
 * revoke URL of the sign-in that names it, and no others (core's
 * `pluginClientSecretHosts`, which the trust content of `halonic plugin add`
 * reads too).
 *
 * @example
 * clientSecretHosts(gitlab, "gitlab-client"); // [{ fromSetting: "server" }]
 */
export function clientSecretHosts(plugin: Plugin, secret: string): DeclaredHost[] {
  return pluginClientSecretHosts(plugin, secret);
}

/** The client secrets of a plugin's backend: the secrets a sign-in names, in the sheet's order. */
export function clientSecretNames(plugin: Plugin): string[] {
  return pluginClientSecretNames(plugin);
}
