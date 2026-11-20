import {
  isPluginSecretName,
  pluginSecretNamePrefix,
  pluginSecretSeparator,
  type Secrets,
  secretKey,
} from "@halonicjs/ports";

/**
 * The plugins' secrets Studio handed the host, kept in memory only: never on
 * disk, never in an answer or the log. Studio keeps them in the keychain,
 * which the host can't read, and hands a trusted plugin its own before each
 * use (ADR 2026-11-19, "Studio hands a plugin its secrets").
 *
 * Each value is kept under the plugin's own name for it,
 * `plugin__<id>__<secret>`, which the caller builds with `pluginSecretNames`.
 * {@link PluginSecretValues.secrets} answers only such names, so nothing else
 * comes out of it even by mistake; the kit still reads a backend's secrets
 * through `pluginSecrets(id)` on top of it.
 */
export class PluginSecretValues {
  /** Each value by its name's `secretKey` form, so a read matches as `Secrets` compares names. */
  readonly #values = new Map<string, string>();
  /** The `secretKey` forms each plugin holds, so a replace removes what it no longer sends. */
  readonly #keysOf = new Map<string, readonly string[]>();

  /**
   * Replaces everything held for `plugin` with `values`. An empty `values`
   * forgets the plugin.
   *
   * @param values - each value by the plugin's own name for it, `plugin__<id>__<secret>`
   * @throws RangeError for a name that isn't one of this plugin's; nothing is changed then
   */
  replace(plugin: string, values: ReadonlyMap<string, string>): void {
    const own = secretKey(`${pluginSecretNamePrefix}${plugin}${pluginSecretSeparator}`);
    const keyed = [...values].map(([name, value]) => [ownKey(own, name), value] as const);
    this.forget(plugin);
    if (keyed.length === 0) return;
    for (const [key, value] of keyed) this.#values.set(key, value);
    this.#keysOf.set(
      plugin,
      keyed.map(([key]) => key),
    );
  }

  /** Drops every value held for `plugin`. */
  forget(plugin: string): void {
    for (const key of this.#keysOf.get(plugin) ?? []) this.#values.delete(key);
    this.#keysOf.delete(plugin);
  }

  /** Drops every value, when the host stops. */
  clear(): void {
    this.#values.clear();
    this.#keysOf.clear();
  }

  /** How many values are held for `plugin`. */
  countFor(plugin: string): number {
    return this.#keysOf.get(plugin)?.length ?? 0;
  }

  /** The values as `Secrets`: a plugin's name gives its value or `null`, any other name `null`. */
  readonly secrets: Secrets = {
    get: async (name) =>
      isPluginSecretName(name) ? (this.#values.get(secretKey(name)) ?? null) : null,
  };
}

/** The name's `secretKey` form, when it starts with the plugin's own prefix `own`. */
function ownKey(own: string, name: string): string {
  const key = secretKey(name);
  if (!key.startsWith(own)) {
    throw new RangeError("The host keeps only a plugin's own secrets.");
  }
  return key;
}
