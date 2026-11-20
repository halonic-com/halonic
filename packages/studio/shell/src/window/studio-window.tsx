import type { MenuEntry } from "@halonicjs/studio-kit";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { HeaderBadges } from "../badges/header-badges.tsx";
import { FeatureDialogs } from "../dialogs/feature-dialogs.tsx";
import type { StudioHost } from "../engine/engine-words.ts";
import { StudioHostContext } from "../engine/studio-host-context.ts";
import { usePresentationFromWidth } from "../frame/frame-effects.ts";
import { ShellFrame } from "../frame/shell-frame.tsx";
import { StatusBarItems } from "../frame/status-bar.tsx";
import { StatusBarSaveNote } from "../frame/status-bar-save-note.tsx";
import { itemLocation } from "../palette/palette-groups.ts";
import { usePaletteOpening } from "../palette/palette-opening.ts";
import { runWithToast, ShellPalette } from "../palette/shell-palette.tsx";
import { BottomNavigation } from "../phone/bottom-navigation.tsx";
import type { MorePageSwitcher } from "../phone/more-page.tsx";
import { usePhoneBackButton } from "../phone/phone-back.ts";
import { PhoneTopBarSlot } from "../phone/phone-top-bar-actions.tsx";
import { settingsLocation } from "../phone/place-stacks.ts";
import { sectionLocation } from "../phone/settings-list-page.tsx";
import { usePhonePlaces } from "../phone/use-phone-places.ts";
import { placeNames, type SidebarPlace } from "../points/frame.ts";
import type { ItemRef, OpenItemOptions } from "../points/item-kinds.ts";
import type { KeyboardPlatform } from "../points/keybindings.ts";
import { ResourceStatusItem } from "../resources/resource-status-item.tsx";
import type { ResourceWatch } from "../resources/resource-watch.ts";
import { announceSaveNotes } from "../save/save-note-words.ts";
import { useAvailableSections } from "../settings/available-sections.ts";
import { SettingsDialog } from "../settings/settings-dialog.tsx";
import { listedSections, settingsGroups } from "../settings/settings-groups.ts";
import { useSettingsOpening } from "../settings/settings-opening.ts";
import type { Shell } from "../shell.ts";
import { studioTab } from "../sidebar/sidebar-views.tsx";
import type { WorkspaceSwitcherProps } from "../sidebar/workspace-switcher.tsx";
import { usePageHeadingFocus, usePageHeadingFocusAfterDialog } from "../tabs/history-moves.ts";
import { openLocation } from "../tabs/open-location.ts";
import { TabPages } from "../tabs/tab-pages.tsx";
import type { TabLocation } from "../tabs/tab-set.ts";
import { useWindowKeys } from "../tabs/use-window-keys.ts";
import { WindowTabStrip } from "../tabs/window-tab-strip.tsx";
import { HistoryButtons } from "../title-bar/history-buttons.tsx";
import { TitleBarBrand } from "../title-bar/title-bar-brand.tsx";
import type { WorkspaceContext } from "../workspace-context.ts";
import { activeItemOf } from "./active-item.ts";
import { useClosingGoneItemTabs } from "./gone-item-tabs.ts";
import { useOpenPageAcrossLayouts } from "./layout-crossing.ts";
import { useShownPlaces } from "./shown-places.ts";
import { StudioPage } from "./studio-page.tsx";
import { StudioPhonePage, StudioPhoneTopBar } from "./studio-phone.tsx";
import { StudioSidebar } from "./studio-sidebar.tsx";
import type { StudioWorkspace } from "./studio-workspace.ts";
import { useActiveTabTitle, useWindowTitle } from "./window-title.ts";

/** What the window lets its workspace menu do. */
export interface WindowActions {
  /** Runs the command with this id, any feature's, and says whether a feature added it. */
  readonly runCommand: (commandId: string) => boolean;
}

/** The workspace switcher as {@link StudioWindow} takes it. */
export interface StudioSwitcher extends Omit<WorkspaceSwitcherProps, "menu"> {
  readonly menu: readonly MenuEntry[] | ((window: WindowActions) => readonly MenuEntry[]);
}

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
  /**
   * The system's region format as a language tag, such as `nl-NL`, read by the desktop app.
   * Formats' "Follow this computer" uses it; without it Formats follows the browser's language.
   */
  readonly regionFormat?: string | undefined;
  /**
   * The sidebar's workspace switcher, once the app has a workspace menu (T3). The menu is a list of
   * rows, or a function of the window's actions for rows that open a page (**Workspace settings…**).
   */
  readonly switcher?: StudioSwitcher | undefined;
  /** The phone's More page switcher row, once the app has a workspace picker (T3). */
  readonly phoneSwitcher?: MorePageSwitcher | undefined;
  /** The workspace's header badges, such as "Not trusted yet · Review", on the desktop. */
  readonly badges?: ReactNode;
  /** The header badge on the phone's More page, on its own line under the workspace row. */
  readonly phoneBadge?: ReactNode;
  /**
   * The engine's resource report, for the status bar item with Halonic's memory and free disk
   * space. The desktop app passes it; a served browser and a phone don't show the item.
   */
  readonly resources?: ResourceWatch | undefined;
  /**
   * This place has no host settings yet, so Settings and Ctrl K leave out the `host` sections
   * (Assistant, Agent sandbox, About Halonic): a served browser until `halonic serve` gives the
   * page the computer's settings (HAL-6159 design, section 5).
   */
  readonly withoutHostSettings?: boolean | undefined;
}

/** The memory and disk item: only the desktop app, and only when it passed the engine's report. */
function DesktopResourceItem({
  host,
  resources,
}: {
  readonly host: StudioHost;
  readonly resources: ResourceWatch | undefined;
}) {
  if (host !== "desktop-app" || resources === undefined) {
    return null;
  }
  return <ResourceStatusItem watch={resources} />;
}

/**
 * The whole Studio window, put together from the shell's parts. On the desktop
 * (`shell.studio-window`): the Halonic Studio mark, Back, Forward and the window tabs in the title
 * bar, the sidebar, the active tab's page with the last five kept mounted, the
 * status bar items with the save note at its right end, and the Ctrl K palette, opened from the Search box, Mod K, **+** and Ctrl T.
 * Settings opens over it (`shell.settings-window`) from the context's `openSettings`, the
 * sidebar's Settings row and, in the desktop app, Mod ,.
 *
 * On a phone (`shell.studio-phone`): the top bar with Back and **Search**, the page of the phone
 * place the user is in, and the bottom navigation, with Android's back handled by the shell. The
 * phone keeps its own places (`usePhonePlaces`) next to the desktop's tabs, and a window that
 * crosses `PHONE_MAX_WIDTH` keeps the page that's open (`useOpenPageAcrossLayouts`).
 *
 * @example
 * <StudioWindow shell={shell} workspace={workspace} host="desktop-app" platform="windows" language="en" />
 */
export function StudioWindow(props: StudioWindowProps) {
  // What the window draws deep down, such as a page that can't load its code, reads the host here.
  return (
    <StudioHostContext value={props.host}>
      <StudioWindowBody {...props} />
    </StudioHostContext>
  );
}

function StudioWindowBody(props: StudioWindowProps) {
  const { shell, workspace, host, platform, withoutHostSettings } = props;
  const { tabs } = workspace;
  const { announcer, contributions } = shell;
  const palette = usePaletteOpening(platform);
  const settings = useSettingsOpening(host, platform);
  const showSettingsDialog = settings.show;
  // The sections this window has, so the list, the dialog and Ctrl K all leave out the same ones.
  const placeSections = useMemo(() => {
    const all = contributions.settings.list();
    return withoutHostSettings === true ? all.filter(({ scope }) => scope !== "host") : all;
  }, [contributions, withoutHostSettings]);
  const baseContextFor = useCallback(
    (featureId: string) => shell.services.contextFor(featureId, workspace.services),
    [shell, workspace.services],
  );
  const sections = useAvailableSections(placeSections, baseContextFor);
  const settingsSections = useMemo(
    () => sections.map(({ id, title }) => ({ id, title })),
    [sections],
  );
  const desktop = usePresentationFromWidth() === "desktop";
  const phone = usePhonePlaces();
  // The phone top bar's slot for the page's own buttons; `null` on the desktop, which has none.
  const [topBarSlot, setTopBarSlot] = useState<HTMLElement | null>(null);
  const { open: openPhone } = phone;
  // Settings is a dialog on the desktop and a page on the More stack below 600px (flow-settings 13).
  // Read when it opens, so the context stays the same as the window narrows or widens.
  const onDesktop = useRef(desktop);
  onDesktop.current = desktop;
  const settingsScroll = useRef(0);
  const openSettings = useCallback(
    (sectionId?: string) => {
      if (onDesktop.current) {
        showSettingsDialog(sectionId);
        return;
      }
      settingsScroll.current = 0;
      openPhone(settingsLocation, { list: true });
      // The sections the phone's list shows, so a link can't open one the list leaves out.
      const section =
        sectionId === undefined
          ? undefined
          : listedSections(
              settingsGroups({
                sections,
                workspaceName: workspace.name,
                place: host === "desktop-app" ? "app" : "served",
                phone: true,
              }),
            ).find((candidate) => candidate.id === sectionId);
      if (section !== undefined) {
        openPhone(sectionLocation(section));
      }
    },
    [showSettingsDialog, openPhone, sections, workspace.name, host],
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
  const openItemInNewTab = useRef<(location: TabLocation) => void>(phone.open);
  openItemInNewTab.current = desktop
    ? (location) => openLocation(tabs, announcer, location, true)
    : (location) => phone.open(location);
  const activeItem = useMemo(() => activeItemOf(tabs), [tabs]);
  // The sidebar switch's tab, kept here in memory only so a view can ask for another one.
  const [sidebarView, setSidebarView] = useState<string>(studioTab);
  const showSidebarView = useCallback(
    (viewId: string) => {
      const known =
        viewId === studioTab ||
        contributions.sidebarViews.list().some((view) => view.id === viewId);
      if (known) setSidebarView(viewId);
    },
    [contributions],
  );
  const contextFor = useCallback(
    (featureId: string): WorkspaceContext => ({
      ...shell.services.contextFor(featureId, workspace.services),
      ...(onDesktop.current ? { activeItem, showSidebarView } : {}),
      host,
      openPlace: (place) => openPlaceHere.current(place),
      openPlaceList: (place, sub, title) => {
        if (!onDesktop.current)
          openPhone({ key: `${place}/${sub}`, title }, { list: true, replaceSibling: true });
      },
      badges: shell.badges,
      saving: workspace.saving,
      closeStack: shell.closeStack,
      openItem: (item, options) => openHere.current(locationOfItem(item, options)),
      openItemInNewTab: (item) => openItemInNewTab.current(locationOfItem(item)),
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
    [
      shell,
      workspace,
      host,
      openSettings,
      openPhone,
      settingsSections,
      contributions,
      activeItem,
      showSidebarView,
    ],
  );
  const runCommand = (commandId: string): boolean => {
    const command = contributions.commands.get(commandId, contextFor);
    if (command === undefined) {
      return false;
    }
    runWithToast(command, contextFor, shell.toasts);
    return true;
  };
  const sidebarSwitcher = withActions(props.switcher, { runCommand });
  /** The item's place, named as its kind's tab names it, as Ctrl K opens a found item. */
  function locationOfItem(item: ItemRef, options?: OpenItemOptions): TabLocation {
    const kind = contributions.itemKinds.get(item.kind);
    const label = kind?.tab?.describe(item, contextFor(kind.featureId)).label ?? item.id;
    const location = itemLocation(item, label, contributions.itemKinds);
    return options?.step === undefined ? location : { ...location, step: options.step };
  }
  // The same list each render, so the sidebar subscribes to the places' signals only once.
  const places = useMemo(() => contributions.places.list(), [contributions]);
  const sidebarViews = useMemo(() => contributions.sidebarViews.list(), [contributions]);
  const kinds = useMemo(() => contributions.itemKinds.list(), [contributions]);
  useClosingGoneItemTabs(tabs, kinds, contextFor);
  usePhoneBackButton(!desktop, shell.closeStack, phone);
  useOpenPageAcrossLayouts({
    desktop,
    tabs,
    phone,
    placeOfKind: (kind) => contributions.itemKinds.get(kind)?.place,
    showSettings: showSettingsDialog,
  });
  // Read again on every phone move and whenever a place's signal changes, so the bottom
  // navigation's counts follow, such as the Inbox's right after an answer (HAL-13371).
  const shown = useShownPlaces(places, contextFor);
  useWindowKeys({ host, platform, tabs, toasts: shell.toasts, onNewTab: palette.show });
  // Ctrl K's palette closes as it opens a page, and its focus return mustn't win over the `h1`.
  const focusPageOpenedFromPalette = usePageHeadingFocusAfterDialog();
  // The palette is the desktop's: one opened on a phone (Mod K on a keyboard) or left open when the
  // window narrows is closed, so it doesn't pop up when the window widens again.
  const { open: paletteOpen, close: closePalette } = palette;
  useEffect(() => {
    if (paletteOpen && !desktop) {
      closePalette();
    }
  }, [paletteOpen, desktop, closePalette]);
  useEffect(() => announceSaveNotes(workspace.saving, announcer), [workspace, announcer]);
  // The Places button is the frame's; Settings opened from the drawer gives focus back to it.
  const placesButton = useRef<HTMLButtonElement>(null);
  // A phone shows its own place's page, not the active tab's, so the title names that page.
  const tabTitle = useActiveTabTitle(tabs);
  useWindowTitle(desktop ? tabTitle : phone.topBar.title, workspace.name);
  // The features' badges first, as the status bar shows them; a window as narrow as a phone
  // shows the same ones on More, as it has no status bar (WCAG 1.4.10).
  const headerBadges = (
    <>
      <HeaderBadges registry={shell.badges} />
      {props.badges}
    </>
  );

  return (
    <ShellFrame
      announcer={announcer}
      placesButton={placesButton}
      closeStack={shell.closeStack}
      engine={shell.engine}
      toasts={shell.toasts}
      language={props.language}
      titleBar={
        <>
          <span className="flex items-center gap-1 self-center">
            <TitleBarBrand />
            <HistoryButtons tabs={tabs} />
          </span>
          <WindowTabStrip tabs={tabs} onNewTab={palette.show} windowKeys={{ host, platform }} />
        </>
      }
      badges={headerBadges}
      saveNote={<StatusBarSaveNote saving={workspace.saving} />}
      phoneBadges={<HeaderBadges registry={shell.badges} layout="strip" />}
      sidebar={
        <StudioSidebar
          places={places}
          views={sidebarViews}
          selectedView={sidebarView}
          onSelectView={setSidebarView}
          tabs={tabs}
          announcer={announcer}
          platform={platform}
          contextFor={contextFor}
          onSearch={palette.show}
          onSettings={() => openSettings()}
          switcher={sidebarSwitcher}
        />
      }
      statusBar={
        <>
          <StatusBarItems items={contributions.statusBar.list()} contextFor={contextFor} />
          <DesktopResourceItem host={host} resources={props.resources} />
        </>
      }
      phoneTopBar={
        <StudioPhoneTopBar
          places={phone}
          slot={setTopBarSlot}
          search={{
            recent: workspace.recent,
            providers: contributions.search.providers(),
            commands: contributions.commands
              .list(contextFor)
              .filter((command) => command.phone !== false),
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
              backLink
            />
          )}
        />
      ) : (
        <PhoneTopBarSlot value={topBarSlot}>
          <StudioPhonePage
            places={phone}
            shown={shown}
            switcher={props.phoneSwitcher}
            menuSwitcher={sidebarSwitcher}
            badge={props.phoneBadge}
            desktopBadges={headerBadges}
            onSettings={() => openSettings()}
            settingsPlace={host === "desktop-app" ? "app" : "served"}
            settingsSections={sections}
            regionFormat={props.regionFormat}
            settingsScroll={settingsScroll}
            workspaceName={workspace.name}
            shell={shell}
            tabs={tabs}
            announcer={announcer}
            contextFor={contextFor}
          />
        </PhoneTopBarSlot>
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
          onOpenedHere={focusPageOpenedFromPalette}
        />
      ) : null}
      {settings.opening === undefined ? null : (
        <SettingsDialog
          key={settings.opening}
          sections={sections}
          workspaceName={workspace.name}
          place={host === "desktop-app" ? "app" : "served"}
          regionFormat={props.regionFormat}
          requested={settings.requested}
          lastShown={settings.lastShown}
          onShown={settings.remember}
          rowKey={host === "desktop-app" ? platform : undefined}
          contextFor={contextFor}
          announcer={announcer}
          onClose={settings.close}
          returnFocus={() => placesButton.current}
        />
      )}
      <FeatureDialogs hosts={contributions.dialogs.list()} contextFor={contextFor} />
    </ShellFrame>
  );
}

/** The switcher the sidebar draws: a menu given as a function is made with the window's actions. */
function withActions(
  switcher: StudioSwitcher | undefined,
  actions: WindowActions,
): WorkspaceSwitcherProps | undefined {
  if (switcher === undefined) {
    return undefined;
  }
  const { menu } = switcher;
  return { ...switcher, menu: typeof menu === "function" ? menu(actions) : menu };
}
