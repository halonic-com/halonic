import type { PluginService, PluginTrustRefusal } from "@halonicjs/app";
import type { PluginsHost } from "@halonicjs/studio-feature-plugins/api";

/** The page's actions, as the host gives them. */
export type PluginActions = PluginsHost["actions"];

/** What {@link desktopPluginActions} uses of core's `PluginService`. */
export type PluginActionsService = Pick<PluginService, "trust" | "revoke" | "remove">;

/** What {@link desktopPluginActions} uses of the feed: reading again, and what the page was shown. */
export interface PluginActionsFeed {
  reload(): Promise<void>;
  fingerprintOf(plugin: string): string | undefined;
}

/** What {@link desktopPluginActions} is made of. */
export interface PluginActionsParts {
  readonly service: PluginActionsService;
  readonly feed: PluginActionsFeed;
  /** Deletes a removed plugin's secrets from the keychain. */
  readonly secrets: PluginsHost["secrets"];
  /** Shows a plugin's folder in the file manager; `true` when it was shown. */
  readonly reveal: (plugin: string) => Promise<boolean>;
  /** Told when a change was saved but reading the folder again failed; the page keeps its old plugins. */
  readonly onReloadFailed: (error: unknown) => void;
}

/**
 * The plugins page's actions over core's `PluginService`. Each change reads the feed again, so the
 * page shows it. Trust saves only what the page showed: it passes the fingerprint of the feed's last
 * read, so a plugin whose files changed since is refused instead of trusted unseen.
 *
 * @example
 * const actions = desktopPluginActions({ service, feed, secrets, reveal, onReloadFailed });
 * await actions.trust("acme-weather");
 */
export function desktopPluginActions({
  service,
  feed,
  secrets,
  reveal,
  onReloadFailed,
}: PluginActionsParts): PluginActions {
  const changing = async <T>(change: () => Promise<T>): Promise<T> => {
    const result = await change();
    // The change has happened. A failed re-read doesn't undo it, and the feed keeps its plugins,
    // so the person gets the change's result and the next reload shows it.
    await feed.reload().catch(onReloadFailed);
    return result;
  };
  return {
    trust: (plugin) =>
      changing(async () => {
        const shown = feed.fingerprintOf(plugin);
        if (shown === undefined) throw new Error("the plugin can't be read");
        const trusted = await service.trust(plugin, shown, "prompt");
        if (!trusted.ok) throw new Error(trustRefusalLine(trusted.error));
      }),
    revoke: (plugin) => changing(() => service.revoke(plugin)),
    remove: (plugin) =>
      changing(async () => {
        const removed = await service.remove(plugin, (name) => secrets.remove(name));
        return removed.ok ? ({ kind: "removed" } as const) : removed.error;
      }),
    usedBy: async () => {
      // Connectors live in each workspace's files; the app doesn't scan them all yet, and the
      // page says so rather than claiming nothing uses the plugin.
      throw new Error("Halonic can't look through every workspace yet");
    },
    // No checkForUpdate or applyUpdate: core can't read a plugin's source again yet (HAL-9373),
    // so the page leaves Check for updates and Update from folder out (UX check N5b).
    reload: () => feed.reload(),
    openFolder: async (plugin) => {
      if ((await reveal(plugin)) !== true) throw new Error("the plugin's folder isn't there");
    },
  };
}

/** Why a refused trust says so: the files changed since the page drew the check, or can't be read. */
function trustRefusalLine(refusal: PluginTrustRefusal): string {
  return refusal.kind === "broken"
    ? "the plugin can't be read now"
    : "the plugin changed since you reviewed it";
}
