import type { SettingsSectionProps } from "@halonicjs/studio-shell";
import { useEffect, useState, useSyncExternalStore } from "react";
import { AddPluginDialog } from "../add/add-plugin-dialog.tsx";
import { PluginsService } from "../api.ts";
import { pluginPageItem } from "../page/plugin-pages.ts";
import { ReviewPluginDialog } from "../page/review-plugin-dialog.tsx";
import { usePageActions } from "../page/use-page-actions.ts";
import { PluginsList } from "./plugins-list.tsx";

/**
 * Settings → Plugins (`plugins.plugin-settings-list`): the installed plugins and the ones that
 * come with Halonic, with **Add plugin**. A row opens the plugin's page, which closes Settings
 * first so the focus can go to the page's heading. A served Settings is view only, whichever of
 * the `place` prop and the host's `place` says so. When **Add** works, the add dialog closes and
 * the plugin's trust check opens at once (checklist 3 and 4.5): **Trust and turn on** says it is
 * on, **Not now** says it is added but off, and either way the plugin's page opens.
 */
export function PluginsSettingsSection({ context, closeSettings, place }: SettingsSectionProps) {
  const plugins = context.services.get(PluginsService);
  const installed = useSyncExternalStore(plugins.feed.subscribe, plugins.feed.current);
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState<string | undefined>(undefined);
  const { toastOn, toastAddedOff } = usePageActions();
  const open = (plugin: string, inNewTab: boolean) => {
    closeSettings();
    const item = pluginPageItem(plugin);
    if (inNewTab) context.openItemInNewTab?.(item);
    else context.openItem?.(item);
  };
  const justAdded = installed.find((plugin) => plugin.plugin === added);
  // An added plugin that can't be read has no trust check to show: its page says why.
  const unreadable = justAdded !== undefined && justAdded.manifest === undefined;
  useEffect(() => {
    if (!unreadable) return;
    setAdded(undefined);
    open(justAdded.plugin, false);
  });
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
            setAdded(plugin);
          }}
          onOpen={(plugin) => {
            setAdding(false);
            open(plugin, false);
          }}
          onCancel={() => setAdding(false)}
        />
      ) : null}
      {justAdded?.manifest === undefined ? null : (
        <ReviewPluginDialog
          added
          plugin={justAdded}
          manifest={justAdded.manifest}
          trust={plugins.actions.trust}
          programsRun={plugins.actions.programsRun}
          onTrusted={() => toastOn(justAdded.name, justAdded.manifest)}
          onNotNow={() => {
            setAdded(undefined);
            toastAddedOff(justAdded.name);
            open(justAdded.plugin, false);
          }}
          onClose={() => {
            setAdded(undefined);
            open(justAdded.plugin, false);
          }}
        />
      )}
    </>
  );
}
