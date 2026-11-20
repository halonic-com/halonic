import type { PluginTrustChanges, PluginTrustFiles } from "@halonicjs/app";
import type { Plugin } from "@halonicjs/format";
import type { ItemKindContribution, ItemRef, WorkspaceContext } from "@halonicjs/studio-shell";
import type { PluginPanelFeed, PluginPanelUi } from "../panel/plugin-panels.ts";
import type {
  PluginSecretStore,
  PluginSettingsReader,
} from "../settings/plugin-settings-section.tsx";
import type { PluginSignIns } from "../sign-in/plugin-sign-ins-section.tsx";
import { PLUGIN, type PluginOrigin } from "./page-text.ts";
import type { PluginActions } from "./plugin-actions.ts";

/** The item kind of a plugin's own page; its tab's place is `plugin/this-computer/<plugin>`. */
export const PLUGIN_KIND = "plugin";

/** The hub part of a plugin's places: plugins are installed per computer, not in a hub. */
export const PLUGIN_HUB = "this-computer";

/** What a tool does, as the manifest says: `read`, `write` (changes things) or `send`. */
export type PluginToolRisk = "read" | "write" | "send";

/**
 * One problem that stops a plugin from loading, as core's loader gives it (`PluginProblem`): the
 * file, where in it, and the message.
 */
export interface PluginLoadProblem {
  /** The file it is about, such as `plugin.yaml`; `""` for the folder itself. */
  readonly file: string;
  /** Where in the manifest, as keys and list indexes; `[]` when it isn't about one value. */
  readonly path: readonly (string | number)[];
  readonly message: string;
}

/**
 * One installed plugin, as its page, its panel and its cards need it. A plugin that can't load has
 * no `manifest`, and its `problems` say why; `name` is then its folder's name.
 */
export interface InstalledPlugin extends PluginPanelUi {
  /** The manifest, as core read and checked it, when it could. */
  readonly manifest?: Plugin | undefined;
  /** When the person trusted it, or the version before a change, as ISO text. */
  readonly trustedAt?: string | undefined;
  /** Where it was added from, when it was added through Add plugin. */
  readonly origin?: PluginOrigin | undefined;
  /** What changed since the person trusted it, while its status is `changed`. */
  readonly changes?: PluginTrustChanges | undefined;
  /** The plugin folder's real path on this computer, for the trust check's Folder line. */
  readonly location?: string | undefined;
  /** The backend files its fingerprint covers, as the trust check lists them. */
  readonly backendFiles?: PluginTrustFiles | undefined;
  /** Why it can't load; empty while it loads. */
  readonly problems: readonly PluginLoadProblem[];
}

/**
 * How a feed's first read of the installed plugins went. Until one read works, the list can't say
 * which plugins there are; once one has, a later read that fails keeps the plugins it had.
 */
export type InstalledPluginsRead =
  | { readonly kind: "reading" }
  | { readonly kind: "failed"; readonly error: unknown }
  | { readonly kind: "ready" };

/**
 * The installed plugins as they change while Studio runs, with what their pages need. It also
 * serves as the panels' `PluginPanelFeed` and Home's `PluginCardFeed`.
 */
export interface InstalledPluginFeed extends PluginPanelFeed {
  readonly current: () => readonly InstalledPlugin[];
  /**
   * How the first read went: the same object until it changes, and the listeners are called when
   * it does. A feed without it has its plugins from the start.
   */
  readonly firstRead?: () => InstalledPluginsRead;
}

/** What a plugin's page needs from the Studio. */
export interface PluginPageOptions {
  readonly feed: InstalledPluginFeed;
  /** Reads and saves the plugins' settings: core's `PluginService`. */
  readonly settings: PluginSettingsReader;
  /** The keychain, for a plugin's secret settings. */
  readonly secrets: PluginSecretStore;
  /** The agent host's sign-ins and the browser; without it the page shows no sign-ins. */
  readonly signIns?: PluginSignIns | undefined;
  /** Opens the plugin's panel in its tab, the same as "Open *name* panel" in Ctrl K. */
  readonly openPanel: (plugin: string) => void;
  /** Remove trust, Remove plugin…, Check again and Open folder. */
  readonly actions: PluginActions;
  /** `served` in a browser on `halonic serve`; the page is view only there. Default `app`. */
  readonly place?: "app" | "served";
}

/** The item a plugin's page is. */
export function pluginPageItem(plugin: string): ItemRef {
  return { kind: PLUGIN_KIND, hub: PLUGIN_HUB, id: plugin };
}

/** The plugin that the feed gives now for `item`, if any. */
export function pagePlugin(feed: InstalledPluginFeed, item: ItemRef): InstalledPlugin | undefined {
  return feed.current().find((candidate) => candidate.plugin === item.id);
}

/**
 * The `plugin` item kind (design section 7, UX checklist 6): a plugin's own page in a tab, named by
 * the plugin's name, with its status, its settings and what it adds. Review and Details on its
 * cards and its panel open it. The view is imported the first time a page shows.
 *
 * @param optionsFor - what a page needs, for the context of the view or tab asking
 *
 * @example
 * studio.itemKinds.add(pluginPageKind((context) => pageOptions(context.services.get(PluginsService), context)));
 */
export function pluginPageKind(
  optionsFor: (context: WorkspaceContext) => PluginPageOptions,
): ItemKindContribution {
  return {
    kind: PLUGIN_KIND,
    label: PLUGIN,
    icon: "plugin",
    open: {
      view: "PluginPageView",
      load: async () => {
        const { pageView } = await import("./plugin-page-view.tsx");
        return { PluginPageView: pageView(optionsFor) };
      },
    },
    tab: {
      describe: (item, context) => ({
        label: pagePlugin(optionsFor(context).feed, item)?.name ?? item.id,
      }),
      exists: (item, context) => pagePlugin(optionsFor(context).feed, item) !== undefined,
    },
  };
}
