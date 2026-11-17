import type { SettingsSectionProps } from "@halonicjs/studio-shell";
import { useState, useSyncExternalStore } from "react";
import { AddPluginDialog } from "../add/add-plugin-dialog.tsx";
import { PluginsService } from "../api.ts";
import { pluginPageItem } from "../page/plugin-pages.ts";
import { PluginsList } from "./plugins-list.tsx";

/**
 * Settings → Plugins (`plugins.plugin-settings-list`): the installed plugins and the ones that
 * come with Halonic, with **Add plugin**. A row opens the plugin's page, which closes Settings
 * first so the focus can go to the page's heading. A served Settings is view only, whichever of
 * the `place` prop and the host's `place` says so.
 */
export function PluginsSettingsSection({ context, closeSettings, place }: SettingsSectionProps) {
  const plugins = context.services.get(PluginsService);
  const installed = useSyncExternalStore(plugins.feed.subscribe, plugins.feed.current);
  const [adding, setAdding] = useState(false);
  const open = (plugin: string, inNewTab: boolean) => {
    closeSettings();
    const item = pluginPageItem(plugin);
    if (inNewTab) context.openItemInNewTab?.(item);
    else context.openItem?.(item);
  };
  return (
    <>
      <PluginsList
        load={{ kind: "ready" }}
        plugins={installed}
        builtIn={plugins.builtIn ?? []}
        actions={plugins.actions}
        onOpen={(plugin) => open(plugin, false)}
        onOpenInNewTab={(plugin) => open(plugin, true)}
        {...(plugins.installer === undefined ? {} : { onAdd: () => setAdding(true) })}
        onRetry={() => {}}
        place={place === "served" || plugins.place === "served" ? "served" : "app"}
      />
      {adding && plugins.installer !== undefined ? (
        <AddPluginDialog
          installer={plugins.installer}
          onAdded={(plugin) => {
            setAdding(false);
            open(plugin, false);
          }}
          onOpen={(plugin) => {
            setAdding(false);
            open(plugin, false);
          }}
          onCancel={() => setAdding(false)}
        />
      ) : null}
    </>
  );
}
