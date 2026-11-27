import { TauriPickedFolders } from "@halonicjs/adapter-fs-tauri";
import {
  chosenFormatOf,
  type DisplaySettings,
  watchAppearance,
} from "@halonicjs/studio-feature-settings";
import { type OpenedWorkspace, RecentWorkspaces } from "@halonicjs/studio-feature-workspace";
import type { TauriIpc } from "@halonicjs/studio-services";
import {
  type FocusedAppContribution,
  type FocusedWindowProps,
  type KeyboardPlatform,
  mountFocusedWindow,
  type Registered,
  type Shell,
} from "@halonicjs/studio-shell";
import { startFocusedWindowFeedback } from "../feedback/start-window-feedback.ts";
import { desktopOpenExternal } from "./desktop-open-external.ts";
import type { DeviceMemory } from "./device-memory.ts";
import { keepFocusedContent, shownInApp } from "./focused-window-content.ts";
import { appFrameColour, followFrameColour } from "./frame-colour.ts";
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
  /** Opens the workspace in a folder; {@link openFolder} unless a test gives its own. */
  readonly openWorkspace?: ((location: string) => Promise<OpenedWorkspace>) | undefined;
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
 * How long a focused app's window waits for its workspace before the console says which step it
 * still waits on (`studio.focused-app-start`): a minute, as long as the window waits before it
 * offers to open Halonic (`shell.focused-app-opening`).
 */
export const focusedOpenLimitMs = 60_000;

/** The step of opening a focused app's workspace under way, named as the console says it. */
export type OpenStep =
  | "reading the window's content"
  | "reopening the folder"
  | "opening the workspace";

/** Where a focused app's open is, so a slow one can say which step it waits on. */
export interface OpenProgress {
  /** The step under way. */
  step: OpenStep;
}

/** The workspace a focused app's window opened, where, and what the window showed before. */
interface FoundWorkspace {
  readonly opened: OpenedWorkspace;
  readonly location: string;
  readonly content: WindowContent;
}

/**
 * Starts a focused app's window (`studio.focused-app-window`): only that app, on the approved
 * frame, for the workspace it showed before, or else the one Studio last had open, opened as a
 * Recent row opens it (`studio.window-content`). The window is drawn at once, saying it reads the
 * workspace, before it waits on the shell for anything (`studio.focused-app-start`, HAL-20489), so
 * the page's own "Starting Halonic…" text never stays. With no workspace in Recent, or one that
 * can't be opened, the window says to open Halonic, its button brings Studio's window forward, and
 * the reason goes to the console. One still opening after {@link focusedOpenLimitMs} keeps saying
 * so, the console names the step it waits on, and it shows once it opens. Its times follow the system's region format, as Studio's window's do,
 * and it hears the feedback shortcut as Studio's window does, sending through the workspace it
 * opened. It never opens the workspace's engine for routines: Studio's window does, and engine
 * locks are held per window. Quick ask's box starts through `startAskBox` instead, which opens no
 * engine at all.
 */
export function startFocusedApp(page: StudioPage, parts: FocusedAppParts): StartedStudio {
  const { shell, ipc, app, language, display } = parts;
  const stopAppearance = watchAppearance(display, page.element.ownerDocument.documentElement);
  const document = page.element.ownerDocument;
  const stopFrameColour = followFrameColour(ipc, document, () => appFrameColour(document));
  let windowProps: FocusedWindowProps = {
    shell,
    app,
    workspace: undefined,
    opening: true,
    language,
    chosenFormat: chosenFormatOf(display),
    openStudio: () => showStudio(ipc),
  };
  // The app's approval pages and outside links open in the system browser, as in Studio's window.
  const mounted = mountFocusedWindow(page.element, windowProps, desktopOpenExternal(page.window));
  let stopped = false;
  const redraw = (change: Partial<FocusedWindowProps>) => {
    windowProps = { ...windowProps, ...change };
    if (!stopped) mounted.update(windowProps);
  };
  // The app's times follow the system's region format once the shell has read it, as Studio's do.
  const stopRegion = followSystemRegion(ipc, (regionFormat) => redraw({ regionFormat }));
  const progress: OpenProgress = { step: "reading the window's content" };
  const limit = setTimeout(() => {
    console.error(
      `The focused app's workspace hasn't opened after ${focusedOpenLimitMs} ms: still ${progress.step}.`,
    );
  }, focusedOpenLimitMs);
  let settled = false;
  const opening = openFocusedWorkspace(page, parts, progress).catch((error: unknown) => {
    console.error("The focused app couldn't open its workspace:", error);
    return undefined;
  });
  const shown = opening.then((found) => {
    settled = true;
    clearTimeout(limit);
    redraw({ workspace: found?.opened.workspace, opening: false });
    return found;
  });
  const keeping = keepShownContent(ipc, app, shown);
  const feedback = startFeedback(page, parts, shown);
  const close = async (opened: OpenedWorkspace | undefined) => {
    (await feedback)();
    (await keeping)();
    await opened?.dispose();
  };
  return {
    host: "desktop-app",
    stop: async () => {
      clearTimeout(limit);
      stopRegion();
      stopped = true;
      mounted.unmount();
      stopFrameColour();
      stopAppearance();
      // An open still under way isn't waited for: it may never end. It is closed once it does.
      if (!settled) {
        shown
          .then((found) => close(found?.opened))
          .catch((error: unknown) => {
            console.error("The focused app's workspace didn't close:", error);
          });
        return;
      }
      await close((await shown)?.opened);
    },
  };
}

/** Opens the workspace the window showed, or the first in Recent; `undefined` when there is none. */
async function openFocusedWorkspace(
  page: StudioPage,
  parts: FocusedAppParts,
  progress: OpenProgress,
): Promise<FoundWorkspace | undefined> {
  const { shell, ipc, display } = parts;
  const device: DeviceMemory = {
    recent: new RecentWorkspaces(page.storage ?? noStorage),
    storage: page.storage ?? noStorage,
    platform: parts.platform,
  };
  const content = await readWindowContent(ipc);
  const location = locationToOpen(device.recent.list(), content);
  if (location === undefined) return undefined;
  const open =
    parts.openWorkspace ?? ((at: string) => openFolder(shell, page.window, at, display, device));
  const opened = await openLast(ipc, location, open, progress);
  return opened === undefined ? undefined : { opened, location, content };
}

/** Keeps the chat or item the window shows once it shows it; the way to stop keeping. */
function keepShownContent(
  ipc: TauriIpc,
  app: Registered<FocusedAppContribution>,
  shown: Promise<FoundWorkspace | undefined>,
): Promise<() => void> {
  return shown
    .then((found) => {
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
}

/**
 * Send feedback goes through the folder the window opened, so its shortcut starts once the page
 * shows it, with the toasts in view (`studio.feedback-window`).
 */
function startFeedback(
  page: StudioPage,
  parts: FocusedAppParts,
  shown: Promise<FoundWorkspace | undefined>,
): Promise<() => void> {
  return shown
    .then((found) => {
      if (found === undefined) return () => {};
      const openExternal = desktopOpenExternal(page.window);
      return startFocusedWindowFeedback(page, {
        ipc: parts.ipc,
        platform: parts.platform,
        toasts: parts.shell.toasts,
        opened: { location: found.location, value: found.opened },
        openTask: (taskUrl) => void openExternal?.(taskUrl),
      });
    })
    .catch((error: unknown) => {
      console.error("The feedback shortcut won't work in this window:", error);
      return () => {};
    });
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
  progress: OpenProgress = { step: "reopening the folder" },
): Promise<OpenedWorkspace | undefined> {
  try {
    progress.step = "reopening the folder";
    await new TauriPickedFolders(ipc).reopen(location);
    progress.step = "opening the workspace";
    return await open(location);
  } catch (error) {
    console.error(`The focused app couldn't open the workspace at ${location}:`, error);
    return undefined;
  }
}
