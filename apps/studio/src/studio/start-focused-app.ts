import { TauriPickedFolders } from "@halonicjs/adapter-fs-tauri";
import { type DisplaySettings, watchAppearance } from "@halonicjs/studio-feature-settings";
import { type OpenedWorkspace, RecentWorkspaces } from "@halonicjs/studio-feature-workspace";
import type { TauriIpc } from "@halonicjs/studio-services";
import {
  type FocusedAppContribution,
  type FocusedWindowProps,
  type KeyboardPlatform,
  type MountedFocusedWindow,
  mountFocusedWindow,
  type Registered,
  type Shell,
} from "@halonicjs/studio-shell";
import type { DeviceMemory } from "./device-memory.ts";
import { keepFocusedContent, shownInApp } from "./focused-window-content.ts";
import { focusedFrameColour, followFrameColour } from "./frame-colour.ts";
import { noStorage, openFolder } from "./open-folder.ts";
import type { StartedStudio, StudioPage } from "./start-studio.ts";
import { followSystemRegion } from "./system-region.ts";
import { readWindowContent, type WindowContent, WindowContentKeeper } from "./window-content.ts";
import { windowLabelOf } from "./window-label.ts";

/** What a focused app's window is started with, besides its page. */
export interface FocusedAppParts {
  /** The shell, with every desktop feature registered. */
  readonly shell: Shell;
  readonly ipc: TauriIpc;
  readonly platform: KeyboardPlatform;
  readonly app: Registered<FocusedAppContribution>;
  readonly language: string;
  /** The window's display settings, as Studio's window keeps them. */
  readonly display: DisplaySettings;
}

/**
 * The focused app a page's window is (`studio.focused-app-window`): the one a feature added under
 * the window's label, such as `inbox`, or `undefined` for Studio's own window. The desktop shell
 * gives the page no query, so the label comes from Tauri's metadata about the window.
 */
export function focusedAppOf(
  window: object,
  shell: Shell,
): Registered<FocusedAppContribution> | undefined {
  const label = windowLabelOf(window);
  if (label === undefined) return undefined;
  return shell.contributions.focusedApps.list().find((app) => app.id === label);
}

/**
 * Starts a focused app's window (`studio.focused-app-window`): only that app, on the approved
 * frame, for the workspace it showed before, or else the one Studio last had open, opened as a
 * Recent row opens it (`studio.window-content`). With no
 * workspace in Recent, or one that can't be opened, the window says to open Halonic, its button
 * brings Studio's window forward, and the reason it couldn't open goes to the console. Its times
 * follow the system's region format, as Studio's window's do. It never opens the workspace's engine for routines:
 * Studio's window does, and engine locks are held per window. Quick ask's box starts through
 * `startAskBox` instead, which opens no engine at all.
 */
export function startFocusedApp(page: StudioPage, parts: FocusedAppParts): StartedStudio {
  const { shell, ipc, app, language, display } = parts;
  const stopAppearance = watchAppearance(display, page.element.ownerDocument.documentElement);
  const document = page.element.ownerDocument;
  const stopFrameColour = followFrameColour(ipc, document, () => focusedFrameColour(document));
  const device: DeviceMemory = {
    recent: new RecentWorkspaces(page.storage ?? noStorage),
    storage: page.storage ?? noStorage,
    platform: parts.platform,
  };
  let mounted: MountedFocusedWindow | undefined;
  let windowProps: FocusedWindowProps | undefined;
  let regionFormat: string | undefined;
  // The app's times follow the system's region format once the shell has read it, as Studio's do.
  const stopRegion = followSystemRegion(ipc, (region) => {
    regionFormat = region;
    if (windowProps === undefined) return;
    windowProps = { ...windowProps, regionFormat };
    mounted?.update(windowProps);
  });
  const opening = readWindowContent(ipc).then(async (content) => {
    const location = locationToOpen(device.recent.list(), content);
    if (location === undefined) return undefined;
    const opened = await openLast(ipc, location, (at) =>
      openFolder(shell, page.window, at, display, device),
    );
    return opened === undefined ? undefined : { opened, location, content };
  });
  const shown = opening.then((found) => {
    windowProps = {
      shell,
      app,
      workspace: found?.opened.workspace,
      language,
      regionFormat,
      openStudio: () => showStudio(ipc),
    };
    mounted = mountFocusedWindow(page.element, windowProps);
    return found?.opened;
  });
  // The chat or item is asked for once the page shows, while the page is listening.
  const keeping = opening
    .then(async (found) => {
      await shown;
      if (found === undefined) return () => {};
      const { opened, location, content } = found;
      const inApp = shownInApp(app.id, opened.workspace.services);
      const kept = keepFocusedContent(new WindowContentKeeper(ipc), inApp, location, content);
      kept.ready.catch((error: unknown) => {
        console.error("This window won't reopen on what it shows:", error);
      });
      return () => kept.stop();
    })
    .catch((error: unknown) => {
      console.error("This window won't reopen on what it shows:", error);
      return () => {};
    });
  return {
    host: "desktop-app",
    stop: async () => {
      const opened = await shown;
      stopRegion();
      (await keeping)();
      mounted?.unmount();
      stopFrameColour();
      stopAppearance();
      await opened?.dispose();
    },
  };
}

/**
 * The workspace a focused app's window opens (`studio.window-content`): the one it showed, while
 * it is still in Recent, else the first in Recent, the one Studio last had open.
 */
export function locationToOpen(
  recent: readonly { readonly location: string }[],
  content: WindowContent,
): string | undefined {
  const kept = recent.find((remembered) => remembered.location === content.workspace);
  return (kept ?? recent[0])?.location;
}

/** Brings Studio's window forward through the shell; a window that can't show says why in the console. */
export function showStudio(ipc: TauriIpc): void {
  ipc.invoke("show_main_window").catch((error: unknown) => {
    console.error("Halonic's window didn't show:", error);
  });
}

/** Opens the last workspace again, or `undefined` when it can't, saying why in the console. */
export async function openLast(
  ipc: TauriIpc,
  location: string,
  open: (location: string) => Promise<OpenedWorkspace>,
): Promise<OpenedWorkspace | undefined> {
  try {
    await new TauriPickedFolders(ipc).reopen(location);
    return await open(location);
  } catch (error) {
    console.error(`The focused app couldn't open the workspace at ${location}:`, error);
    return undefined;
  }
}
