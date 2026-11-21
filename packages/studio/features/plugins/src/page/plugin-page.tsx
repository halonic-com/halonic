import type { Plugin } from "@halonicjs/format";
import {
  Button,
  CommandBox,
  Menu,
  type MenuEntry,
  MoreIcon,
  ViewOnlyLine,
} from "@halonicjs/studio-kit";
import { type StudioHost, saveNoteWords } from "@halonicjs/studio-shell";
import { useId, useRef, useState } from "react";
import { ADD_COMMAND, viewOnlyLine } from "../list/list-text.ts";
import {
  type PluginSecretStore,
  type PluginSettingsReader,
  PluginSettingsSection,
  type SettingsSaveState,
} from "../settings/plugin-settings-section.tsx";
import { type PluginSignIns, PluginSignInsSection } from "../sign-in/plugin-sign-ins-section.tsx";
import { Quoted } from "../ui/quoted.tsx";
import { OPEN_PANEL, PLUGIN } from "./page-text.ts";
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
import { UsedBy } from "./used-by.tsx";
import { pluginsViewOnly } from "./view-only.ts";
import { WhatItAdds } from "./what-it-adds.tsx";

/** The props of `PluginPage`. */
export interface PluginPageProps {
  readonly plugin: InstalledPlugin;
  readonly settings: PluginSettingsReader;
  readonly secrets: PluginSecretStore;
  /**
   * The agent host's sign-ins and the browser, for a plugin whose backend
   * signs in (HAL-8613). Without it, the page shows no sign-ins.
   */
  readonly signIns?: PluginSignIns | undefined;
  /** Reads a sign-in's new line through the window's announcer (`announcer.announceState`). */
  readonly announceState?: ((key: string, text: string) => void) | undefined;
  /** **Open panel**: opens the plugin's panel in its tab. */
  readonly onOpenPanel: () => void;
  /** Remove trust, Remove plugin…, Check again and Open folder, through the app. */
  readonly actions: PluginActions;
  /**
   * Where Studio is shown: `app` (the default) or `served`, a browser on `halonic serve`.
   * Plugins are view only on a phone and when served (design section 10).
   */
  readonly place?: "app" | "served";
  /** Where the window runs (`context.host`): the desktop app (the default), served, or a phone. */
  readonly host?: StudioHost | undefined;
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
 * plugin…**, which asks first (F18). An action that fails says so in a toast. **Check for
 * updates** (or **Update from folder**) shows only when the app can look for one.
 *
 * On a phone, and in a browser on `halonic serve`, the page is view only: no Trust, Update,
 * Remove trust, Remove, Check again or Open folder, the ⋮ only when there's a panel to open, and
 * at the end the view-only line with the command to run on the computer. A narrow desktop window
 * gets the phone's layout but keeps the actions (`pluginsViewOnly`).
 *
 * @example
 * <PluginPage plugin={weather} settings={pluginService} secrets={keychain} actions={actions}
 *   onOpenPanel={() => openPanel("weather")} />
 */
export function PluginPage({
  plugin,
  settings,
  secrets,
  signIns,
  announceState,
  onOpenPanel,
  actions,
  place = "app",
  host,
  now = () => new Date(),
}: PluginPageProps) {
  const { phone, viewOnly } = pluginsViewOnly(place, host);
  const statusId = useId();
  const statusBox = useRef<HTMLDivElement>(null);
  const [saveState, setSaveState] = useState<SettingsSaveState | undefined>(undefined);
  const [removing, setRemoving] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const { run, fail, toastOn, toastRemoved } = usePageActions();
  const manifest = plugin.manifest;
  const off = plugin.status === "on" ? undefined : { reason: statusId };
  const fromFolder = plugin.origin?.kind === "folder";
  const updates = updatesFor(plugin, actions, viewOnly);
  const canUpdate = updates !== undefined;
  const { update, setUpdate, checkForUpdate } = useUpdateCheck(plugin.plugin, updates, (error) =>
    fail(fromFolder ? "updateFromFolder" : "checkForUpdates", error),
  );
  const menu = menuEntries(
    plugin,
    {
      openPanel: onOpenPanel,
      openFolder: () => run("openFolder", () => actions.openFolder(plugin.plugin)),
      ...(canUpdate && update.kind === "idle"
        ? { checkForUpdate: () => void checkForUpdate(), fromFolder }
        : {}),
      revoke: () => run("revoke", () => actions.revoke(plugin.plugin)),
      remove: () => setRemoving(true),
    },
    viewOnly,
  );

  return (
    <div className="flex flex-col">
      {/* The kind and the name ask for 9rem next to the actions. In a narrower window (a phone,
          or 400 % zoom) the actions go on a line under them, on the right, so the name keeps the
          whole width. */}
      <header className="sticky top-0 z-(--layer-sticky) flex min-h-13 flex-wrap items-center gap-x-4 gap-y-1 border-b border-border bg-surface px-4 py-px">
        <h1 tabIndex={-1} className="flex min-w-0 flex-1 basis-36 items-center gap-1.5 py-2">
          <span className="shrink-0 text-label uppercase text-fg-subtle">{PLUGIN}</span>
          {/* A space for screen readers, so the heading reads "Plugin Weather". */}
          <span className="sr-only"> </span>
          <bdi className="truncate text-body-strong" title={plugin.name}>
            {plugin.name}
          </bdi>
        </h1>
        <div className="ml-auto flex flex-wrap items-center justify-end gap-x-4 gap-y-1 empty:hidden">
          <SaveNote state={saveState} />
          {plugin.panel === undefined ? null : (
            <Button variant="secondary" size="sm" onClick={onOpenPanel}>
              {OPEN_PANEL}
            </Button>
          )}
          {menu.length === 0 ? null : (
            <Menu
              align="end"
              entries={menu}
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
          )}
        </div>
      </header>
      {reviewing && manifest !== undefined ? (
        <ReviewPluginDialog
          plugin={plugin}
          manifest={manifest}
          trust={actions.trust}
          programs={actions.programs}
          unfencedRuns={actions.unfencedRuns}
          onClose={() => setReviewing(false)}
          returnFocus={() => statusBox.current}
          onTrusted={() => toastOn(plugin.name, manifest)}
        />
      ) : null}
      {update.kind === "available" && updates !== undefined ? (
        <UpdatePluginDialog
          plugin={plugin}
          found={update.found}
          applyUpdate={updates.apply}
          programs={actions.programs}
          unfencedRuns={actions.unfencedRuns}
          onUpdated={() => setUpdate({ kind: "idle" })}
          onKeep={() => setUpdate({ kind: "up-to-date", version: updates.version })}
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
          <p className="text-body text-fg-muted wrap-anywhere">
            <Quoted text={manifest.description} />
          </p>
        )}
        <StatusBox
          id={statusId}
          boxRef={statusBox}
          plugin={plugin}
          now={now}
          onCheckAgain={() => run("reload", actions.reload)}
          onOpenFolder={() => run("openFolder", () => actions.openFolder(plugin.plugin))}
          onReview={() => setReviewing(true)}
          viewOnly={viewOnly}
          update={
            canUpdate ? updateControl(update, fromFolder, () => void checkForUpdate()) : undefined
          }
        />
        {manifest === undefined ? null : (
          <PluginSections
            manifest={manifest}
            settings={settings}
            secrets={secrets}
            signIns={signIns}
            announceState={announceState}
            off={off}
            viewOnly={viewOnly}
            onSaveState={setSaveState}
          />
        )}
        <UsedBy plugin={plugin.plugin} usedBy={actions.usedBy} />
        {viewOnly ? <ViewOnlyFooter phone={phone} /> : null}
      </div>
    </div>
  );
}

/** What `PluginSections` needs: the manifest and the page's parts for its sections. */
interface PluginSectionsProps {
  readonly manifest: Plugin;
  readonly settings: PluginSettingsReader;
  readonly secrets: PluginSecretStore;
  readonly signIns: PluginSignIns | undefined;
  readonly announceState: ((key: string, text: string) => void) | undefined;
  readonly off: { readonly reason: string } | undefined;
  readonly viewOnly: boolean;
  readonly onSaveState: (state: SettingsSaveState | undefined) => void;
}

/** Settings, then the sign-ins when the app gives them, then What it adds. */
function PluginSections({
  manifest,
  settings,
  secrets,
  signIns,
  announceState,
  off,
  viewOnly,
  onSaveState,
}: PluginSectionsProps) {
  return (
    <>
      <PluginSettingsSection
        plugin={manifest}
        host={settings}
        secrets={secrets}
        off={off}
        onSaveState={onSaveState}
      />
      {signIns === undefined ? null : (
        <PluginSignInsSection
          plugin={manifest}
          settings={settings}
          signIns={signIns}
          off={off}
          viewOnly={viewOnly}
          announceState={announceState}
        />
      )}
      <WhatItAdds manifest={manifest} />
    </>
  );
}

/**
 * How the page looks for a newer version and puts it in, with the version it has now: only while
 * the plugin is on and was added through Add plugin, the page isn't view only, and the app can
 * look at all (N5b).
 * `undefined` leaves **Check for updates** (or **Update from folder**) out.
 */
function updatesFor(
  plugin: InstalledPlugin,
  actions: PluginActions,
  viewOnly: boolean,
): Updates | undefined {
  const { checkForUpdate: check, applyUpdate: apply } = actions;
  if (viewOnly || check === undefined || apply === undefined) return undefined;
  if (plugin.status !== "on" || plugin.origin === undefined || plugin.manifest === undefined) {
    return undefined;
  }
  return { check, apply, version: plugin.manifest.version };
}

/** What `updatesFor` gives the page. */
interface Updates {
  readonly check: NonNullable<PluginActions["checkForUpdate"]>;
  readonly apply: NonNullable<PluginActions["applyUpdate"]>;
  readonly version: string;
}

/**
 * Where **Check for updates** is, and the check itself: busy while it looks, then up to date or
 * the newer version found. A check that fails calls `onFailed` and the button is back.
 */
function useUpdateCheck(
  plugin: string,
  updates: Updates | undefined,
  onFailed: (error: unknown) => void,
) {
  const [update, setUpdate] = useState<UpdateState>({ kind: "idle" });
  async function check() {
    if (updates === undefined) return;
    setUpdate({ kind: "checking" });
    try {
      const found = await updates.check(plugin);
      setUpdate(
        found.kind === "up-to-date"
          ? { kind: "up-to-date", version: updates.version }
          : { kind: "available", found },
      );
    } catch (error) {
      onFailed(error);
      setUpdate({ kind: "idle" });
    }
  }
  return { update, setUpdate, checkForUpdate: check };
}

/** The view-only line and the command to run on the computer (design section 10). */
function ViewOnlyFooter({ phone }: { readonly phone: boolean }) {
  return (
    <div className="flex flex-col gap-2">
      <ViewOnlyLine>{viewOnlyLine(phone)}</ViewOnlyLine>
      <CommandBox command={ADD_COMMAND} />
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

/** The ⋮'s items (F17): Remove trust only while there's trust to remove; view only, just the panel. */
function menuEntries(plugin: InstalledPlugin, act: MenuActions, viewOnly: boolean): MenuEntry[] {
  // View only: nothing that changes the computer, so just the panel.
  if (viewOnly) {
    return plugin.panel === undefined
      ? []
      : [{ id: "panel", label: OPEN_PANEL, onSelect: act.openPanel }];
  }
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
