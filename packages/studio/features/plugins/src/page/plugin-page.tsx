import { Button, Menu, type MenuEntry, MoreIcon } from "@halonicjs/studio-kit";
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
  CHECK_FOR_UPDATES,
  moreActionsFor,
  OPEN_FOLDER,
  type PluginActions,
  type PluginUpdateCheck,
  REMOVE_PLUGIN_ELLIPSIS,
  REMOVE_TRUST,
  UPDATE_FROM_FOLDER,
} from "./plugin-actions.ts";
import type { InstalledPlugin } from "./plugin-pages.ts";
import { RemovePluginDialog } from "./remove-plugin-dialog.tsx";
import { ReviewPluginDialog } from "./review-plugin-dialog.tsx";
import { StatusBox, type UpdateControl } from "./status-box.tsx";
import { UpdatePluginDialog } from "./update-plugin-dialog.tsx";
import { usePageActions } from "./use-page-actions.ts";
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
  const [reviewing, setReviewing] = useState(false);
  const [update, setUpdate] = useState<UpdateState>({ kind: "idle" });
  const { run, fail, toastOn, toastRemoved } = usePageActions();
  const manifest = plugin.manifest;
  const off = plugin.status === "on" ? undefined : { reason: statusId };
  const fromFolder = plugin.origin?.kind === "folder";
  const canUpdate = plugin.status === "on" && plugin.origin !== undefined && manifest !== undefined;

  async function checkForUpdate() {
    if (manifest === undefined) return;
    setUpdate({ kind: "checking" });
    try {
      const found = await actions.checkForUpdate(plugin.plugin);
      setUpdate(
        found.kind === "up-to-date"
          ? { kind: "up-to-date", version: manifest.version }
          : { kind: "available", found },
      );
    } catch (error) {
      fail(fromFolder ? "updateFromFolder" : "checkForUpdates", error);
      setUpdate({ kind: "idle" });
    }
  }
  return (
    <div className="flex flex-col">
      <header className="sticky top-0 z-(--layer-sticky) flex min-h-13 items-center gap-4 border-b border-border bg-surface px-4">
        <h1 tabIndex={-1} className="flex min-w-0 flex-1 items-center gap-1.5 outline-none">
          <span className="shrink-0 text-label uppercase text-fg-subtle">{PLUGIN}</span>
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
            ...(canUpdate && update.kind === "idle"
              ? { checkForUpdate: () => void checkForUpdate(), fromFolder }
              : {}),
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
      {reviewing && manifest !== undefined ? (
        <ReviewPluginDialog
          plugin={plugin}
          manifest={manifest}
          trust={actions.trust}
          onClose={() => setReviewing(false)}
          onTrusted={() => toastOn(plugin.name, manifest)}
        />
      ) : null}
      {update.kind === "available" ? (
        <UpdatePluginDialog
          plugin={plugin}
          found={update.found}
          applyUpdate={actions.applyUpdate}
          onUpdated={() => setUpdate({ kind: "idle" })}
          onKeep={() => setUpdate({ kind: "up-to-date", version: manifest?.version ?? "" })}
        />
      ) : null}
      {removing ? (
        <RemovePluginDialog
          plugin={plugin}
          remove={actions.remove}
          usedBy={actions.usedBy}
          onRemoved={() => {
            // Closed here, so it doesn't sit on "Removing…" until the list drops the plugin.
            setRemoving(false);
            toastRemoved(plugin.name);
          }}
          onCancel={() => setRemoving(false)}
        />
      ) : null}
      <div className="flex max-w-reading flex-col gap-6 p-4">
        {manifest === undefined || manifest.description === "" ? null : (
          <p className="text-body text-fg-muted wrap-anywhere">{quoted(manifest.description)}</p>
        )}
        <StatusBox
          id={statusId}
          plugin={plugin}
          now={now}
          onCheckAgain={() => run("reload", actions.reload)}
          onOpenFolder={() => run("openFolder", () => actions.openFolder(plugin.plugin))}
          onReview={() => setReviewing(true)}
          update={
            canUpdate ? updateControl(update, fromFolder, () => void checkForUpdate()) : undefined
          }
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

/** Where **Check for updates** is: not looked, looking, found something, or nothing newer. */
type UpdateState =
  | { readonly kind: "idle" }
  | { readonly kind: "checking" }
  | { readonly kind: "up-to-date"; readonly version: string }
  | {
      readonly kind: "available";
      readonly found: Extract<PluginUpdateCheck, { kind: "available" }>;
    };

/** The status box's update action; while the dialog is open the button stays busy behind it. */
function updateControl(
  update: UpdateState,
  fromFolder: boolean,
  onCheck: () => void,
): UpdateControl {
  if (update.kind === "up-to-date") {
    return { fromFolder, state: { upToDate: update.version }, onCheck };
  }
  const state = update.kind === "idle" ? "idle" : "checking";
  return { fromFolder, state, onCheck };
}

/** What the ⋮ does. */
interface MenuActions {
  readonly openPanel: () => void;
  readonly openFolder: () => void;
  /** Only while the plugin can be updated and nothing was looked for yet. */
  readonly checkForUpdate?: () => void;
  readonly fromFolder?: boolean;
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
    ...(act.checkForUpdate === undefined
      ? []
      : [
          {
            id: "update",
            label: act.fromFolder === true ? UPDATE_FROM_FOLDER : CHECK_FOR_UPDATES,
            onSelect: act.checkForUpdate,
          },
        ]),
    { id: "folder", label: OPEN_FOLDER, onSelect: act.openFolder },
    ...(trusted ? [{ id: "revoke", label: REMOVE_TRUST, onSelect: act.revoke }] : []),
    "divider",
    { id: "remove", label: REMOVE_PLUGIN_ELLIPSIS, danger: true, onSelect: act.remove },
  ];
}
