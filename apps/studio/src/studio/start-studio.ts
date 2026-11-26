import { TauriPickedFolders } from "@halonicjs/adapter-fs-tauri";
import {
  BrowserDisplayPrefs,
  chosenFormatOf,
  DisplaySettings,
  type DisplayStorage,
  watchAppearance,
} from "@halonicjs/studio-feature-settings";
import {
  FreshCopyAsks,
  mountWorkspaceWindow,
  NewWorkspaceAsks,
  type RecentStorage,
  RecentWorkspaces,
  WorkspaceSwitcher,
} from "@halonicjs/studio-feature-workspace";
import { onWindowCloseRequested, type TauriIpc, tauriIpc } from "@halonicjs/studio-services";
import {
  createShell,
  type KeyboardPlatform,
  type Shell,
  type StudioHost,
} from "@halonicjs/studio-shell";
import { mainWindowFeedbackOf, startWindowFeedback } from "../feedback/start-window-feedback.ts";
import { desktopFeatures } from "./desktop-features.ts";
import { newWorkspaceOf } from "./desktop-new-workspace.ts";
import { desktopOpenExternal } from "./desktop-open-external.ts";
import { watchDesktopResources } from "./desktop-resources.ts";
import type { DeviceMemory } from "./device-memory.ts";
import { followFrameColour, studioFrameColour } from "./frame-colour.ts";
import { noStorage, openFolder } from "./open-folder.ts";
import { halonicVersion } from "./open-trusts.ts";
import { startServedStudio } from "./served-studio.ts";
import { isAskBoxWindow, startAskBox } from "./start-ask-box.ts";
import { feedbackWindowOf, startFeedbackWindow } from "./start-feedback-window.ts";
import { focusedAppOf, startFocusedApp } from "./start-focused-app.ts";
import { watchStart } from "./start-watch.ts";
import { keepStudioWorkspace } from "./studio-window-content.ts";

export { openFolder } from "./open-folder.ts";
export { servedServices } from "./served-studio.ts";

import { keyboardPlatform, studioHost } from "./studio-host.ts";
import { followSystemRegion } from "./system-region.ts";
import {
  closeLimitMs,
  leaveFocusedField,
  windowCloseHandler,
  withinLimit,
} from "./window-close.ts";

export { desktopFeatures };

/**
 * The language of the Studio's words. Every text is English in v0.1, so the window's
 * `<html lang>` says so whatever the browser prefers; the kit's tabs hyphenate by it.
 */
const studioLanguage = "en";

/** What {@link startStudio} needs from the page it runs in. */
export interface StudioPage {
  /** The element the window is drawn into, the page's `#root`. */
  readonly element: Element;
  /** The page's global object; the desktop app's webview marks it as Tauri's. */
  readonly window: object;
  /** The browser's `navigator.userAgent`, for Ctrl or ⌘. */
  readonly userAgent: string;
  /** Where the desktop app keeps Recent on this device: the page's `localStorage`. */
  readonly storage?: RecentStorage | undefined;
  /** Asks the page's own address, for the served Studio's `GET /api/workspace`: the page's `fetch`. */
  readonly fetch?: ((path: string, init?: RequestInit) => Promise<Response>) | undefined;
}

/** A started Studio. */
export interface StartedStudio {
  /** Where the Studio found itself running. */
  readonly host: StudioHost;
  /** Takes the window off the page and disposes the open workspaces' services. */
  stop(): Promise<void>;
}

/**
 * Starts the Studio in a page (`studio.entry`). The desktop app starts on the Welcome screen and
 * opens the folders the user picks, each with its own services, behind the workspace switcher
 * (`studio.open-folder`). A window the shell opened for a focused app, such as Halonic Inbox, shows
 * only that app (`studio.focused-app-window`), and a feedback shortcut's window only its page
 * (`studio.feedback-windows`). The served Studio shows the one workspace the computer serves
 * (`studio.served-workspace`). The window is the shell's or the workspace feature's; the app only
 * starts it, as AGENTS.md asks of screens.
 *
 * The desktop app registers the Inbox, Google setup, Workflows and Runs, over the runs in each open folder, Settings
 * (`studio.settings`) and the workspace page (`workspace.page`). The served Studio registers the Inbox over the served workspace's
 * runs, Settings and the Google setup, read-only (`studio.served-google-setup-accounts`).
 *
 * @param desktop the desktop app's features and the services it gives them, `desktopFeatures`
 *
 * @example
 * startStudio({ element: root, window, userAgent: navigator.userAgent, storage: localStorage });
 */
export function startStudio(page: StudioPage, desktop = desktopFeatures): StartedStudio {
  const host = studioHost(page.window);
  const platform = keyboardPlatform(page.userAgent);
  const ipc = tauriIpc(page.window);
  if (ipc !== undefined) {
    // The feedback's own small windows start nothing else.
    const feedback = feedbackWindowOf(page.window);
    if (feedback !== undefined) {
      return startFeedbackWindow(page, { ipc, kind: feedback, display: displaySettingsOf(page) });
    }
    // Quick ask's box starts only itself and the Messenger it asks through, not every feature.
    if (isAskBoxWindow(page.window)) {
      return startAskBox(page, {
        ipc,
        host,
        platform,
        language: studioLanguage,
        display: displaySettingsOf(page),
      });
    }
    const shell = createShell({ ...desktop, host, platform });
    // Halonic Inbox and Halonic Messenger load this page too, in a window of their own. They have
    // no folder to send feedback from, so only the main window hears its shortcut (HAL-19671).
    const app = focusedAppOf(page.window, shell);
    if (app === undefined) return startDesktopApp(page, { shell, ipc, platform });
    return startFocusedApp(page, {
      shell,
      ipc,
      platform,
      app,
      language: studioLanguage,
      display: displaySettingsOf(page),
    });
  }
  return startServedStudio(page, {
    host,
    platform,
    language: studioLanguage,
    display: displaySettingsOf(page),
  });
}

/** What the desktop app's window is made of. */
interface DesktopParts {
  readonly shell: Shell;
  readonly ipc: TauriIpc;
  readonly platform: KeyboardPlatform;
}

/**
 * The desktop app: Welcome, then the folders the user opens (`studio.open-folder`). The shell
 * gives the page only the folders the user picked in it, and remembers them across restarts, so
 * a Recent row reopens its folder in the shell first and Remove from Recent forgets it there.
 */
function startDesktopApp(page: StudioPage, { shell, ipc, platform }: DesktopParts): StartedStudio {
  const display = displaySettingsOf(page);
  const stopAppearance = watchAppearance(display, rootOf(page.element));
  const document = page.element.ownerDocument;
  const stopFrameColour = followFrameColour(ipc, document, () =>
    studioFrameColour(document, display),
  );
  const picked = new TauriPickedFolders(ipc);
  const newWorkspaceAsks = new NewWorkspaceAsks();
  const freshCopyAsks = new FreshCopyAsks();
  const newWorkspace = newWorkspaceOf(page.window, platform);
  const openExternal = desktopOpenExternal(page.window);
  // Send feedback follows the folder shown, so it reads the switcher made below once it starts.
  const feedback = mainWindowFeedbackOf(page, {
    folders: () => switcher.open,
    toasts: shell.toasts,
    openTask: (taskUrl) => void openExternal?.(taskUrl),
  });
  const device: DeviceMemory = {
    recent: new RecentWorkspaces(page.storage ?? noStorage),
    storage: page.storage ?? noStorage,
    platform,
    feedback,
    ...(newWorkspace.newWorkspace === undefined
      ? {}
      : { startOwnWorkspace: () => newWorkspaceAsks.ask() }),
    ...(newWorkspace.sample === undefined
      ? {}
      : { startOver: (copied) => freshCopyAsks.ask(copied) }),
  };
  const switcher = new WorkspaceSwitcher({
    pickFolder: () => pickFolder(ipc),
    openFolder: (location) => openFolder(shell, page.window, location, display, device),
    reopenFolder: (location) => picked.reopen(location),
    forgetFolder: (location) => picked.forget(location),
    recent: device.recent,
    toasts: shell.toasts,
  });
  const stopFeedback = startWindowFeedback(page, ipc, platform, shell.toasts, feedback);
  const resources = watchDesktopResources(ipc);
  const start = watchStart(ipc, platform, halonicVersion);
  const parts = {
    shell,
    switcher,
    platform,
    language: studioLanguage,
    chosenFormat: chosenFormatOf(display),
    resources,
    start,
    ...newWorkspace,
    newWorkspaceAsks,
    freshCopyAsks,
  };
  const window = mountWorkspaceWindow(page.element, parts, openExternal);
  // Formats follows the system's region once the shell has read it; until then, the browser's.
  const stopRegion = followSystemRegion(ipc, (r) => window.update({ ...parts, regionFormat: r }));
  const stopListening = onWindowCloseRequested(
    page.window,
    windowCloseHandler({
      workspaces: switcher,
      stop: () => stopped(),
      limitMs: closeLimitMs,
      within: withinLimit,
      settleDrafts: () => leaveFocusedField(page.element.ownerDocument),
    }),
  );
  const keepingContent = keepStudioWorkspace(ipc, switcher);
  keepingContent.ready.catch((error: unknown) => {
    console.error("Studio's window won't reopen on what it shows:", error);
  });
  const stopped = once(async () => {
    keepingContent.stop();
    stopFeedback();
    stopRegion();
    resources.stop();
    start.stop();
    await stopListening();
    window.unmount();
    stopFrameColour();
    stopAppearance();
    await switcher.dispose();
  });
  return { host: "desktop-app", stop: stopped };
}

/** Runs `task` on the first call and gives every later call the same run. */
function once(task: () => Promise<void>): () => Promise<void> {
  let run: Promise<void> | undefined;
  return () => {
    run ??= task();
    return run;
  };
}
/**
 * The window's display settings, one for every workspace in it, so a change in Settings reaches
 * the whole window at once. They are kept in the page's storage until the app profile keeps them
 * (HAL-1294 plan); a change in another window comes in through the page's `storage` event.
 */
export function displaySettingsOf(page: Pick<StudioPage, "window" | "storage">): DisplaySettings {
  const events = page.window instanceof EventTarget ? page.window : new EventTarget();
  return new DisplaySettings(new BrowserDisplayPrefs(page.storage ?? unsavedStorage, events));
}

/** The page's `<html>`, where the Appearance settings show, so the whole window follows them. */
function rootOf(element: Element): HTMLElement {
  return element.ownerDocument.documentElement;
}

/** The shell's folder picker: the picked folder's location, or `undefined` when cancelled. */
async function pickFolder(ipc: TauriIpc): Promise<string | undefined> {
  const picked = await ipc.invoke("pick_folder");
  return typeof picked === "string" ? picked : undefined;
}

/**
 * The display settings on a page without storage: saving fails, so Settings says so and puts the
 * value back, instead of "saving" something nothing keeps.
 */
const unsavedStorage: DisplayStorage = {
  getItem: () => null,
  setItem: () => {
    throw new Error("This page has no storage.");
  },
};
