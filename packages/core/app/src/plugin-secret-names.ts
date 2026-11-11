// The names a plugin's secrets are kept under in `Secrets`, as
// `app.plugin-secret-names` asks (ADR 2026-11-09-plugins, section 3). Each
// name holds the plugin's id, so a plugin reads only the secrets stored for
// it, never one a person stored for something else, and removing the plugin
// knows what to delete.

import type { Plugin } from "@halonicjs/format";
import { pluginSecretNamePrefix } from "@halonicjs/ports";

/**
 * Comes between the id and the secret's name, and ends
 * `pluginSecretNamePrefix`, the prefix no workspace may pick. `Secrets` takes
 * `-` and `_` as the same character, so a single one can't tell `a-b` + `c`
 * from `a` + `b-c`. Ids and secret names never hold two `-` in a row, so a
 * doubled `_` can't come from either of them.
 */
const separator = "__";

/**
 * The name the secret `secret` of the plugin `id` is kept under.
 *
 * @example
 * pluginSecretName("weather", "weather-key"); // "plugin__weather__weather-key"
 */
export function pluginSecretName(id: string, secret: string): string {
  return `${pluginSecretNamePrefix}${id}${separator}${secret}`;
}

/**
 * The name each secret the plugin declares is kept under, by the declared
 * name: its backend's secrets and every local tool's. A secret name is in
 * one part only, as `format.plugin-checks` asks.
 */
export function pluginSecretNames(plugin: Plugin): Record<string, string> {
  const declared = [
    ...Object.keys(plugin.backend?.secrets ?? {}),
    ...(plugin.localTools ?? []).flatMap((localTool) => Object.keys(localTool.secrets)),
  ];
  return Object.fromEntries(
    declared.map((secret) => [secret, pluginSecretName(plugin.id, secret)]),
  );
}
