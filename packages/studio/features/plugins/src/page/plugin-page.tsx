import { Button, Menu, type MenuEntry, MoreIcon, useToastStore } from "@halonicjs/studio-kit";
import { saveNoteWords } from "@halonicjs/studio-shell";
import { useId, useState } from "react";
import {
  type PluginSecretStore,
  type PluginSettingsReader,
  PluginSettingsSection,
  type SettingsSaveState,
} from "../settings/plugin-settings-section.tsx";
import { OPEN_PANEL, PLUGIN, quoted } from "./page-text.ts";
import {
  ACTION_WORDS,
  actionFailedLine,
  moreActionsFor,
  OPEN_FOLDER,
  type PluginActions,
  REMOVE_PLUGIN_ELLIPSIS,
  REMOVE_TRUST,
  removedToast,
} from "./plugin-actions.ts";
import type { InstalledPlugin } from "./plugin-pages.ts";
import { messageOf, RemovePluginDialog } from "./remove-plugin-dialog.tsx";
import { StatusBox } from "./status-box.tsx";
import { WhatItAdds } from "./what-it-adds.tsx";

/** The props of `PluginPage`. */
export interface PluginPageProps {
  readonly plugin: InstalledPlugin;
  readonly settings: PluginSettingsReader;
  readonly secrets: PluginSecretStore;
  /** **Open panel**: opens the plugin's panel in its tab. */
  readonly onOpenPanel: () => void;
  /** Remove trust, Remove plugin…, Check again and Open folder, through the app. */
  readonly actions: PluginActions;
  /** Today, for the trust date's year. */
  readonly now?: () => Date;
}

/**
 * A plugin's page, the page of its tab (design section 7, UX checklist 6, T16-F13 to F16):
 * **PLUGIN** and the plugin's name as the `h1` (not a rename field: the name is the
 * plugin's), **Open panel** when it has a panel; its description in quotes, one status box, its
 * Settings and What it adds. Every word that acts is Halonic's; the plugin's text is plain text.
 *
 * While the plugin is off (not trusted yet, changed, can't load), Settings and What it adds stay
 * readable at full contrast and the fields use the kit's unavailable state, with the status box as
 * the reason. A plugin that can't load shows its problems, path in mono, then the message, with
 * **Check again** and **Open folder**.
 *
 * The ⋮ (F17) has Open panel, Open folder, Remove trust (while it's trusted) and **Remove
 * plugin…**, which asks first (F18). An action that fails says so in a toast.
 *
 * @example
 * <PluginPage plugin={weather} settings={pluginService} secrets={keychain} actions={actions}
 *   onOpenPanel={() => openPanel("weather")} />
 */
export function PluginPage({
  plugin,
  settings,
  secrets,
  onOpenPanel,
  actions,
  now = () => new Date(),
}: PluginPageProps) {
  const statusId = useId();
  const [saveState, setSaveState] = useState<SettingsSaveState | undefined>(undefined);
  const [removing, setRemoving] = useState(false);
  const { run, toastRemoved } = usePageActions();
  const manifest = plugin.manifest;
  const off = plugin.status === "on" ? undefined : { reason: statusId };
  return (
    <div className="flex flex-col">
      <header className="sticky top-0 z-(--layer-sticky) flex min-h-13 items-center gap-4 border-b border-border bg-surface px-4">
        <h1 tabIndex={-1} className="flex min-w-0 flex-1 items-center gap-1.5 outline-none">
          <span className="shrink-0 text-caption uppercase tracking-label text-fg-subtle">
            {PLUGIN}
          </span>
          {/* A space for screen readers, so the heading reads "Plugin Weather". */}
          <span className="sr-only"> </span>
          <span className="truncate text-body-strong" title={plugin.name}>
            {plugin.name}
          </span>
        </h1>
        <SaveNote state={saveState} />
        {plugin.panel === undefined ? null : (
          <Button variant="secondary" size="sm" onClick={onOpenPanel}>
            {OPEN_PANEL}
          </Button>
        )}
        <Menu
          align="end"
          entries={menuEntries(plugin, {
            openPanel: onOpenPanel,
            openFolder: () => run("openFolder", () => actions.openFolder(plugin.plugin)),
            revoke: () => run("revoke", () => actions.revoke(plugin.plugin)),
            remove: () => setRemoving(true),
          })}
          trigger={(trigger) => (
            <Button
              {...trigger}
              variant="ghost"
              size="sm"
              icon={<MoreIcon />}
              label={moreActionsFor(plugin.name)}
            />
          )}
        />
      </header>
      {removing ? (
        <RemovePluginDialog
          plugin={plugin}
          remove={actions.remove}
          onRemoved={() => toastRemoved(plugin.name)}
          onCancel={() => setRemoving(false)}
        />
      ) : null}
      <div className="flex max-w-3xl flex-col gap-6 p-4">
        {manifest === undefined || manifest.description === "" ? null : (
          <p className="text-body text-fg-muted wrap-anywhere">{quoted(manifest.description)}</p>
        )}
        <StatusBox
          id={statusId}
          plugin={plugin}
          now={now}
          onCheckAgain={() => run("reload", actions.reload)}
          onOpenFolder={() => run("openFolder", () => actions.openFolder(plugin.plugin))}
        />
        {manifest === undefined ? null : (
          <>
            <PluginSettingsSection
              plugin={manifest}
              host={settings}
              secrets={secrets}
              off={off}
              onSaveState={setSaveState}
            />
            <WhatItAdds manifest={manifest} />
          </>
        )}
      </div>
    </div>
  );
}

/** "Saving…", then "Saved" with its check; a failure shows under its field instead. */
function SaveNote({ state }: { readonly state: SettingsSaveState | undefined }) {
  if (state === undefined || state === "failed") return null;
  const words = saveNoteWords({ kind: state });
  return (
    <p role="status" className="shrink-0 text-small text-fg-muted">
      {words.mark === "check" ? <span aria-hidden="true">✓ </span> : null}
      {words.name === undefined ? (
        words.text
      ) : (
        <>
          <span aria-hidden="true">{words.text}</span>
          <span className="sr-only">{words.name}</span>
        </>
      )}
    </p>
  );
}

/** What the ⋮ does. */
interface MenuActions {
  readonly openPanel: () => void;
  readonly openFolder: () => void;
  readonly revoke: () => void;
  readonly remove: () => void;
}

/** The ⋮'s items (F17): Remove trust only while there's trust to remove. */
function menuEntries(plugin: InstalledPlugin, act: MenuActions): MenuEntry[] {
  const trusted = plugin.status === "on" || plugin.status === "changed";
  return [
    ...(plugin.panel === undefined
      ? []
      : [{ id: "panel", label: OPEN_PANEL, onSelect: act.openPanel }]),
    { id: "folder", label: OPEN_FOLDER, onSelect: act.openFolder },
    ...(trusted ? [{ id: "revoke", label: REMOVE_TRUST, onSelect: act.revoke }] : []),
    "divider",
    { id: "remove", label: REMOVE_PLUGIN_ELLIPSIS, danger: true, onSelect: act.remove },
  ];
}

/**
 * Runs a page action, and says in a toast when it fails: "Couldn't remove trust: *reason*."
 * `toastRemoved` is the Remove dialog's success: "*name* removed".
 */
function usePageActions() {
  const toasts = useToastStore();
  return {
    run: async (action: keyof typeof ACTION_WORDS, work: () => Promise<void>) => {
      try {
        await work();
      } catch (error) {
        const title = actionFailedLine(ACTION_WORDS[action], messageOf(error));
        toasts?.show({ tone: "danger", title });
      }
    },
    toastRemoved: (name: string) => {
      toasts?.show({ tone: "success", title: removedToast(name) });
    },
  };
}
