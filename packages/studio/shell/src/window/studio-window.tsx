import { useCallback, useEffect, useMemo } from "react";
import type { StudioHost } from "../engine/engine-words.ts";
import { usePresentationFromWidth } from "../frame/frame-effects.ts";
import { ShellFrame } from "../frame/shell-frame.tsx";
import { StatusBarItems } from "../frame/status-bar.tsx";
import { usePaletteOpening } from "../palette/palette-opening.ts";
import { ShellPalette } from "../palette/shell-palette.tsx";
import { BottomNavigation } from "../phone/bottom-navigation.tsx";
import type { MorePageSwitcher } from "../phone/more-page.tsx";
import { usePhoneBackButton } from "../phone/phone-back.ts";
import { usePhonePlaces } from "../phone/use-phone-places.ts";
import type { KeyboardPlatform } from "../points/keybindings.ts";
import { announceSaveNotes } from "../save/save-note-words.ts";
import type { Shell } from "../shell.ts";
import type { WorkspaceSwitcherProps } from "../sidebar/workspace-switcher.tsx";
import { TabPages } from "../tabs/tab-pages.tsx";
import { useWindowKeys } from "../tabs/use-window-keys.ts";
import { WindowTabStrip } from "../tabs/window-tab-strip.tsx";
import { Toolbar } from "../toolbar/toolbar.tsx";
import { ToolbarSaveNote } from "../toolbar/toolbar-save-note.tsx";
import type { WorkspaceContext } from "../workspace-context.ts";
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
  const contextFor = useCallback(
    (featureId: string): WorkspaceContext =>
      shell.services.contextFor(featureId, workspace.services),
    [shell, workspace],
  );
  // The same list each render, so the sidebar subscribes to the places' signals only once.
  const places = useMemo(() => contributions.places.list(), [contributions]);
  const palette = usePaletteOpening(platform);
  const desktop = usePresentationFromWidth() === "desktop";
  const phone = usePhonePlaces();
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
            commands: contributions.commands.list(),
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
          commands={contributions.commands.list()}
          kinds={contributions.itemKinds}
          contextFor={contextFor}
          announcer={announcer}
          toasts={shell.toasts}
          notAnswering={shell.engine.words.notAnswering}
          platform={platform}
          onClose={palette.close}
        />
      ) : null}
    </ShellFrame>
  );
}
