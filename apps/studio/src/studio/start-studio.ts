import { ServiceRegistry } from "@halonicjs/app";
import { tauriIpc } from "@halonicjs/studio-services";
import {
  createShell,
  type KeyboardPlatform,
  mountStudioWindow,
  type StudioHost,
  StudioWorkspace,
} from "@halonicjs/studio-shell";

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
}

/** A started Studio. */
export interface StartedStudio {
  /** Where the Studio found itself running. */
  readonly host: StudioHost;
  /** Takes the window off the page and disposes the workspace's services. */
  stop(): Promise<void>;
}

/**
 * Where this Studio runs (`studio.entry`): the desktop app when the page is in Tauri's
 * webview, else the Studio served to a browser. The Android app never loads this page.
 */
export function studioHost(page: object): StudioHost {
  return tauriIpc(page) === undefined ? "served" : "desktop-app";
}

/** Whether `Mod` means ⌘ or Ctrl here, read from the browser's user agent. */
export function keyboardPlatform(userAgent: string): KeyboardPlatform {
  if (userAgent.includes("Mac")) {
    return "macos";
  }
  if (userAgent.includes("Windows")) {
    return "windows";
  }
  return "linux";
}

/**
 * Starts the Studio in a page (`studio.entry`): creates the shell, opens one workspace with
 * its services and draws one Studio window for it. The window is the shell's; the app only
 * starts it, as AGENTS.md asks of screens.
 *
 * No feature registers yet: the generated feature list still holds each feature's id and title,
 * not a `defineFeature`, so the window shows Home and the Search box until features move to it.
 *
 * @example
 * startStudio({ element: root, window, userAgent: navigator.userAgent });
 */
export function startStudio(page: StudioPage): StartedStudio {
  const host = studioHost(page.window);
  const platform = keyboardPlatform(page.userAgent);
  const shell = createShell({ features: [], host, platform });
  const services = new ServiceRegistry();
  shell.services.instantiate(services);
  const workspace = new StudioWorkspace({ toasts: shell.toasts, services });
  const window = mountStudioWindow(page.element, {
    shell,
    workspace,
    host,
    platform,
    language: studioLanguage,
  });
  return {
    host,
    stop: async () => {
      window.unmount();
      workspace.dispose();
      await services.dispose();
    },
  };
}
