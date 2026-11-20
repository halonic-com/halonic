import type { Secrets } from "@halonicjs/ports";
import type { PluginsHost } from "@halonicjs/studio-feature-plugins/api";

/** What hands a plugin's secrets to the agent host: `AgentHostPluginSecrets`. */
export interface PluginSecretHandOver {
  handOver(plugin: string, secrets: Readonly<Record<string, string>>): Promise<number>;
}

/** What {@link secretHandingCaller} is built from. */
export interface SecretHandingParts {
  /** Calls the plugin's tool through the agent host. */
  readonly caller: PluginsHost["caller"];
  readonly handOver: PluginSecretHandOver;
  /** The keychain, where Studio keeps a plugin's secrets. */
  readonly keychain: Secrets;
  /**
   * The name each secret the plugin declares is kept under, by the declared
   * name, as the feed read it last: `PluginService.secretNames`. Empty for a
   * plugin that declares none, or that the feed hasn't read.
   */
  readonly secretNames: (plugin: string) => Readonly<Record<string, string>>;
}

/**
 * The tool caller that hands a plugin its own secrets to the agent host
 * right before each call (ADR 2026-11-19, "Studio hands a plugin its
 * secrets"). The host can't read the keychain, so it gets each secret the
 * plugin declares, by its declared name, read from the keychain now: a
 * secret the person changed or removed counts at the next call, and a host
 * that restarted gets them again. A plugin that declares none hands nothing
 * over. When the hand-over fails, the call isn't made.
 *
 * @example
 * const caller = secretHandingCaller({ caller, handOver, keychain, secretNames });
 * await caller.call("acme-weather", "forecast", { city: "Oslo" });
 */
export function secretHandingCaller(parts: SecretHandingParts): PluginsHost["caller"] {
  return {
    call: async (plugin, tool, args) => {
      const names = Object.entries(parts.secretNames(plugin));
      if (names.length > 0) {
        await parts.handOver.handOver(plugin, await storedSecrets(parts.keychain, names));
      }
      return await parts.caller.call(plugin, tool, args);
    },
  };
}

/** The values the keychain holds, by declared name; a secret not stored is left out. */
async function storedSecrets(
  keychain: Secrets,
  names: readonly (readonly [declared: string, kept: string])[],
): Promise<Record<string, string>> {
  const stored: Record<string, string> = {};
  for (const [declared, kept] of names) {
    const value = await keychain.get(kept);
    if (value !== null && value !== "") stored[declared] = value;
  }
  return stored;
}
