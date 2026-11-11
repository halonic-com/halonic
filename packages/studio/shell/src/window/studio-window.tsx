import { useCallback, useEffect } from "react";
import type { StudioHost } from "../engine/engine-words.ts";
import { ShellFrame } from "../frame/shell-frame.tsx";
import { StatusBarItems } from "../frame/status-bar.tsx";
import { usePaletteOpening } from "../palette/palette-opening.ts";
import { ShellPalette } from "../palette/shell-palette.tsx";
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
import { StudioPage } from "./studio-page.tsx";
import { StudioSidebar } from "./studio-sidebar.tsx";
import type { StudioWorkspace } from "./studio-workspace.ts";

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
}

/**
 * The whole Studio window on the desktop, put together from the shell's parts
 * (`shell.studio-window`): the window tabs in the title bar, the toolbar with Back, Forward, the
 * path and the save note, the sidebar, the active tab's page with the last five kept mounted, the
 * status bar items, and the Ctrl K palette, opened from the Search box, Mod K, **+** and Ctrl T.
 *
 * The phone's bars come in a later part; on a phone this window shows only the page.
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
  const palette = usePaletteOpening(platform);
  useWindowKeys({ host, platform, tabs, toasts: shell.toasts, onNewTab: palette.show });
  useEffect(() => announceSaveNotes(workspace.saving, announcer), [workspace, announcer]);

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
          places={contributions.places.list()}
          tabs={tabs}
          announcer={announcer}
          platform={platform}
          contextFor={contextFor}
          onSearch={palette.show}
          switcher={props.switcher}
        />
      }
      statusBar={<StatusBarItems items={contributions.statusBar.list()} contextFor={contextFor} />}
    >
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
      {palette.open ? (
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
