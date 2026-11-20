import {
  focusSectionHeading,
  type SettingsSectionProps,
  sectionHeadingLevel,
} from "@halonicjs/studio-shell";
import { type RefObject, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { AddPluginDialog } from "../add/add-plugin-dialog.tsx";
import { PluginsService } from "../api.ts";
import {
  type InstalledPluginFeed,
  type InstalledPluginsRead,
  pluginPageItem,
} from "../page/plugin-pages.ts";
import { ReviewPluginDialog } from "../page/review-plugin-dialog.tsx";
import { usePageActions } from "../page/use-page-actions.ts";
import { LOAD_FAILED_REASON } from "./list-text.ts";
import { BUILT_IN_PLUGINS, PluginsList, type PluginsLoad } from "./plugins-list.tsx";

/** The Library feature's command that shows its Connectors tab. */
const OPEN_CONNECTORS_COMMAND = "library.connector";

const ALWAYS_READ: InstalledPluginsRead = { kind: "ready" };
const alwaysRead = () => ALWAYS_READ;
const LOADING: PluginsLoad = { kind: "loading" };
const LOADED: PluginsLoad = { kind: "ready" };

/**
 * The list's load state from the feed's first read (P2, P3), and **Try again**, which reads again.
 * A failed read always shows {@link LOAD_FAILED_REASON}: the plugins folder reader's errors are
 * written for developers and can name a path or an OS error, which P3 never shows. Try again
 * keeps the error on screen with its button busy; once the plugins read, the focus goes to the
 * section's heading, since the button that had it is gone.
 */
function useFirstRead(
  feed: InstalledPluginFeed,
  reload: () => Promise<void>,
  anchor: RefObject<HTMLElement | null>,
): { readonly load: PluginsLoad; readonly tryAgain: () => void } {
  const read = useSyncExternalStore(feed.subscribe, feed.firstRead ?? alwaysRead);
  const [trying, setTrying] = useState(false);
  const focusHeading = useRef(false);
  useEffect(() => {
    if (read.kind !== "ready" || !focusHeading.current) return;
    focusHeading.current = false;
    focusSectionHeading(anchor.current);
  }, [read.kind, anchor]);
  const tryAgain = () => {
    focusHeading.current = true;
    setTrying(true);
    reload()
      .catch(() => {
        // The feed keeps the failure as its first read, so the list shows the new reason.
        focusHeading.current = false;
      })
      .finally(() => setTrying(false));
  };
  if (read.kind === "failed") {
    return { load: { kind: "failed", reason: LOAD_FAILED_REASON, trying }, tryAgain };
  }
  return { load: read.kind === "reading" ? LOADING : LOADED, tryAgain };
}

/**
 * Settings → Plugins (`plugins.plugin-settings-list`): the installed plugins and the ones that
 * come with Halonic, with **Add plugin**. A row opens the plugin's page, which closes Settings
 * first so the focus can go to the page's heading. A served Settings is view only, whichever of
 * the `place` prop and the host's `place` says so. When **Add** works, the add dialog closes and
 * the plugin's trust check opens at once (checklist 3 and 4.5): **Trust and turn on** says it is
 * on, **Not now** says it is added but off, and either way the plugin's page opens.
 */
export function PluginsSettingsSection({
  context,
  closeSettings,
  place,
  surface,
}: SettingsSectionProps) {
  const plugins = context.services.get(PluginsService);
  const installed = useSyncExternalStore(plugins.feed.subscribe, plugins.feed.current);
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState<string | undefined>(undefined);
  const { toastOn, toastAddedOff } = usePageActions();
  const anchor = useRef<HTMLDivElement>(null);
  const { load, tryAgain } = useFirstRead(plugins.feed, plugins.actions.reload, anchor);
  const open = (plugin: string, inNewTab: boolean) => {
    closeSettings();
    const item = pluginPageItem(plugin);
    if (inNewTab) context.openItemInNewTab?.(item);
    else context.openItem?.(item);
  };
  // The built-in integrations are the Library's connectors, so Open goes there.
  const openConnectors = () => {
    closeSettings();
    context.runCommand?.(OPEN_CONNECTORS_COMMAND);
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
    <div ref={anchor}>
      <PluginsList
        load={load}
        plugins={installed}
        builtIn={plugins.builtIn ?? BUILT_IN_PLUGINS}
        {...(context.runCommand === undefined ? {} : { onOpenBuiltIn: openConnectors })}
        actions={plugins.actions}
        onOpen={(plugin) => open(plugin, false)}
        onOpenInNewTab={(plugin) => open(plugin, true)}
        {...(plugins.installer === undefined ? {} : { onAdd: () => setAdding(true) })}
        onRetry={tryAgain}
        place={place === "served" || plugins.place === "served" ? "served" : "app"}
        headingLevel={sectionHeadingLevel(surface)}
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
    </div>
  );
}
