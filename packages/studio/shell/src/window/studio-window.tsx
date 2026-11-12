import { useCallback, useEffect, useMemo, useRef } from "react";
import { FeatureDialogs } from "../dialogs/feature-dialogs.tsx";
import type { StudioHost } from "../engine/engine-words.ts";
import { usePresentationFromWidth } from "../frame/frame-effects.ts";
import { ShellFrame } from "../frame/shell-frame.tsx";
import { StatusBarItems } from "../frame/status-bar.tsx";
import { itemLocation } from "../palette/palette-groups.ts";
import { usePaletteOpening } from "../palette/palette-opening.ts";
import { runWithToast, ShellPalette } from "../palette/shell-palette.tsx";
import { BottomNavigation } from "../phone/bottom-navigation.tsx";
import type { MorePageSwitcher } from "../phone/more-page.tsx";
import { usePhoneBackButton } from "../phone/phone-back.ts";
import { settingsLocation } from "../phone/place-stacks.ts";
import { sectionLocation } from "../phone/settings-list-page.tsx";
import { usePhonePlaces } from "../phone/use-phone-places.ts";
import { placeNames, type SidebarPlace } from "../points/frame.ts";
import type { ItemRef } from "../points/item-kinds.ts";
import type { KeyboardPlatform } from "../points/keybindings.ts";
import { announceSaveNotes } from "../save/save-note-words.ts";
import { SettingsDialog } from "../settings/settings-dialog.tsx";
import { useSettingsOpening } from "../settings/settings-opening.ts";
import type { Shell } from "../shell.ts";
import type { WorkspaceSwitcherProps } from "../sidebar/workspace-switcher.tsx";
import { usePageHeadingFocus } from "../tabs/history-moves.ts";
import { TabPages } from "../tabs/tab-pages.tsx";
import type { TabLocation } from "../tabs/tab-set.ts";
import { useWindowKeys } from "../tabs/use-window-keys.ts";
import { WindowTabStrip } from "../tabs/window-tab-strip.tsx";
import { Toolbar } from "../toolbar/toolbar.tsx";
import { ToolbarSaveNote } from "../toolbar/toolbar-save-note.tsx";
import type { WorkspaceContext } from "../workspace-context.ts";
import { useClosingGoneItemTabs } from "./gone-item-tabs.ts";
import { shownPlaces } from "./shown-places.ts";
import { StudioPage } from "./studio-page.tsx";
import { StudioPhonePage, StudioPhoneTopBar } from "./studio-phone.tsx";
import { StudioSidebar } from "./studio-sidebar.tsx";
import type { StudioWorkspace } from "./studio-workspace.ts";
import { useActiveTabTitle, useWindowTitle } from "./window-title.ts";

/** Props for {@link StudioWindow}. */
export interface StudioWindowProps {
  /** The registered features and the window's announcer, close stack, engine and toasts. */
  readonly shell: Shell;
  /** The open workspace: its tabs, Recent, save state and services. */
  readonly workspace: StudioWorkspace;
  /** Where the Studio runs; only the desktop app binds the window keys (Ctrl T, Ctrl W, …). */
  readonly host: StudioHost;
  /** Decides Ctrl or ⌘ in the key hints and the keys. */
  readonly platform: KeyboardPlatform;
  /** The language of the Studio's words, such as `en`, set on `<html lang>`. */
  readonly language: string;
  /** The sidebar's workspace switcher, once the app has a workspace menu (T3). */
  readonly switcher?: WorkspaceSwitcherProps | undefined;
  /** The phone's More page switcher row, once the app has a workspace picker (T3). */
  readonly phoneSwitcher?: MorePageSwitcher | undefined;
}

/**
 * The whole Studio window, put together from the shell's parts. On the desktop
 * (`shell.studio-window`): the window tabs in the title bar, the toolbar with Back, Forward, the
 * path and the save note, the sidebar, the active tab's page with the last five kept mounted, the
 * status bar items, and the Ctrl K palette, opened from the Search box, Mod K, **+** and Ctrl T.
 * Settings opens over it (`shell.settings-window`) from the context's `openSettings`, the
 * sidebar's Settings row and, in the desktop app, Mod ,.
 *
 * On a phone (`shell.studio-phone`): the top bar with Back and **Search**, the page of the phone
 * place the user is in, and the bottom navigation, with Android's back handled by the shell. The
 * phone keeps its own places (`usePhonePlaces`) next to the desktop's tabs, so a window that
 * crosses `PHONE_MAX_WIDTH` comes back to where each layout was.
 *
 * @example
 * <StudioWindow shell={shell} workspace={workspace} host="desktop-app" platform="windows" language="en" />
 */
export function StudioWindow(props: StudioWindowProps) {
  const { shell, workspace, host, platform } = props;
  const { tabs } = workspace;
  const { announcer, contributions } = shell;
  const palette = usePaletteOpening(platform);
  const settings = useSettingsOpening(host, platform);
  const showSettingsDialog = settings.show;
  const settingsSections = useMemo(
    () => contributions.settings.list().map(({ id, title }) => ({ id, title })),
    [contributions],
  );
  const desktop = usePresentationFromWidth() === "desktop";
  const phone = usePhonePlaces();
  const { open: openPhone } = phone;
  // Settings is a dialog on the desktop and a page on the More stack below 600px (flow-settings 13).
  // Read when it opens, so the context stays the same as the window narrows or widens.
  const onDesktop = useRef(desktop);
  onDesktop.current = desktop;
  const openSettings = useCallback(
    (sectionId?: string) => {
      if (onDesktop.current) {
        showSettingsDialog(sectionId);
        return;
      }
      openPhone(settingsLocation, { list: true });
      const section =
        sectionId === undefined
          ? undefined
          : contributions.settings.list().find((candidate) => candidate.id === sectionId);
      if (section !== undefined) {
        openPhone(sectionLocation(section));
      }
    },
    [showSettingsDialog, openPhone, contributions],
  );
  const focusNewPage = usePageHeadingFocus();
  // Read when a view opens a place, so the context stays the same as the window narrows or widens.
  const openPlaceHere = useRef<(place: SidebarPlace) => void>(phone.openPlace);
  openPlaceHere.current = desktop
    ? (place) => {
        tabs.openHere({ key: place, title: placeNames[place].label });
        focusNewPage();
      }
    : phone.openPlace;
  // Read when a view opens an item, for the same reason.
  const openHere = useRef<(location: TabLocation) => void>(phone.open);
  openHere.current = desktop
    ? (location) => {
        tabs.openHere(location);
        focusNewPage();
      }
    : (location) => phone.open(location);
  const contextFor = useCallback(
    (featureId: string): WorkspaceContext => ({
      ...shell.services.contextFor(featureId, workspace.services),
      openPlace: (place) => openPlaceHere.current(place),
      openItem: (item) => openHere.current(locationOfItem(item)),
      openSettings,
      settingsSections,
      runCommand: (commandId) => {
        const command = contributions.commands.get(commandId, contextFor);
        if (command === undefined) {
          return false;
        }
        runWithToast(command, contextFor, shell.toasts);
        return true;
      },
    }),
    [shell, workspace, openSettings, settingsSections, contributions],
  );
  /** The item's place, named as its kind's tab names it, as Ctrl K opens a found item. */
  function locationOfItem(item: ItemRef): TabLocation {
    const kind = contributions.itemKinds.get(item.kind);
    const label = kind?.tab?.describe(item, contextFor(kind.featureId)).label ?? item.id;
    return itemLocation(item, label, contributions.itemKinds);
  }
  // The same list each render, so the sidebar subscribes to the places' signals only once.
  const places = useMemo(() => contributions.places.list(), [contributions]);
  const kinds = useMemo(() => contributions.itemKinds.list(), [contributions]);
  useClosingGoneItemTabs(tabs, kinds, contextFor);
  usePhoneBackButton(!desktop, shell.closeStack, phone);
  // Read again on every phone move, so the bottom navigation's signals follow.
  const shown = shownPlaces(contributions.places.list(), contextFor);
  useWindowKeys({ host, platform, tabs, toasts: shell.toasts, onNewTab: palette.show });
  // The palette is the desktop's: one opened on a phone (Mod K on a keyboard) or left open when the
  // window narrows is closed, so it doesn't pop up when the window widens again.
  const { open: paletteOpen, close: closePalette } = palette;
  useEffect(() => {
    if (paletteOpen && !desktop) {
      closePalette();
    }
  }, [paletteOpen, desktop, closePalette]);
  useEffect(() => announceSaveNotes(workspace.saving, announcer), [workspace, announcer]);
  // A phone shows its own place's page, not the active tab's, so the title names that page.
  const tabTitle = useActiveTabTitle(tabs);
  useWindowTitle(desktop ? tabTitle : phone.topBar.title, workspace.name);

  return (
    <ShellFrame
      announcer={announcer}
      closeStack={shell.closeStack}
      engine={shell.engine}
      toasts={shell.toasts}
      language={props.language}
      titleBar={
        <WindowTabStrip tabs={tabs} onNewTab={palette.show} windowKeys={{ host, platform }} />
      }
      toolbar={
        <Toolbar
          tabs={tabs}
          announcer={announcer}
          saveState={<ToolbarSaveNote saving={workspace.saving} />}
        />
      }
      sidebar={
        <StudioSidebar
          places={places}
          tabs={tabs}
          announcer={announcer}
          platform={platform}
          contextFor={contextFor}
          onSearch={palette.show}
          onSettings={() => openSettings()}
          switcher={props.switcher}
        />
      }
      statusBar={<StatusBarItems items={contributions.statusBar.list()} contextFor={contextFor} />}
      phoneTopBar={
        <StudioPhoneTopBar
          places={phone}
          search={{
            recent: workspace.recent,
            providers: contributions.search.providers(),
            commands: contributions.commands.list(contextFor),
            kinds: contributions.itemKinds,
            contextFor,
            announcer,
            toasts: shell.toasts,
            notAnswering: shell.engine.words.notAnswering,
            platform,
          }}
        />
      }
      phoneNavigation={
        phone.navigation === undefined ? undefined : (
          <BottomNavigation places={shown} {...phone.navigation} />
        )
      }
    >
      {desktop ? (
        <TabPages
          tabs={tabs}
          renderPage={(location) => (
            <StudioPage
              location={location}
              shell={shell}
              tabs={tabs}
              announcer={announcer}
              contextFor={contextFor}
            />
          )}
        />
      ) : (
        <StudioPhonePage
          places={phone}
          shown={shown}
          switcher={props.phoneSwitcher}
          onSettings={() => openSettings()}
          settingsPlace={host === "desktop-app" ? "app" : "served"}
          workspaceName={workspace.name}
          shell={shell}
          tabs={tabs}
          announcer={announcer}
          contextFor={contextFor}
        />
      )}
      {/* A phone searches in its Search sheet; Ctrl K's palette is the desktop's. */}
      {palette.open && desktop ? (
        <ShellPalette
          tabs={tabs}
          recent={workspace.recent}
          providers={contributions.search.providers()}
          commands={contributions.commands.list(contextFor)}
          kinds={contributions.itemKinds}
          contextFor={contextFor}
          announcer={announcer}
          toasts={shell.toasts}
          notAnswering={shell.engine.words.notAnswering}
          platform={platform}
          onClose={palette.close}
        />
      ) : null}
      {settings.opening === undefined ? null : (
        <SettingsDialog
          key={settings.opening}
          sections={contributions.settings.list()}
          workspaceName={workspace.name}
          place={host === "desktop-app" ? "app" : "served"}
          requested={settings.requested}
          lastShown={settings.lastShown}
          onShown={settings.remember}
          rowKey={host === "desktop-app" ? platform : undefined}
          contextFor={contextFor}
          announcer={announcer}
          onClose={settings.close}
          returnFocus={placesButton}
        />
      )}
      <FeatureDialogs hosts={contributions.dialogs.list()} contextFor={contextFor} />
    </ShellFrame>
  );
}

/** The toolbar's Places button, in a narrow window, where Settings opened from the drawer closes. */
function placesButton(): HTMLElement | null {
  return document.querySelector<HTMLElement>("[data-places-button] button");
}
