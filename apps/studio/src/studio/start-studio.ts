import { TauriDefinitionStore, TauriRunStore } from "@halonicjs/adapter-fs-tauri";
import { ServiceRegistry } from "@halonicjs/app";
import { inboxFeature } from "@halonicjs/studio-feature-inbox";
import { InboxRunsService } from "@halonicjs/studio-feature-inbox/api";
import { runsFeature } from "@halonicjs/studio-feature-runs";
import { RunsSourceService } from "@halonicjs/studio-feature-runs/api";
import {
  folderName,
  mountWorkspaceWindow,
  type OpenedWorkspace,
  type RecentStorage,
  RecentWorkspaces,
  WorkspaceSwitcher,
} from "@halonicjs/studio-feature-workspace";
import {
  provideShellSecrets,
  TauriChannel,
  type TauriIpc,
  tauriChannelIpc,
  tauriIpc,
} from "@halonicjs/studio-services";
import {
  createShell,
  type KeyboardPlatform,
  mountStudioWindow,
  type Shell,
  type StudioHost,
  StudioWorkspace,
} from "@halonicjs/studio-shell";
import { WorkspaceRuns } from "../runs/workspace-runs.ts";

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
}

/** A started Studio. */
export interface StartedStudio {
  /** Where the Studio found itself running. */
  readonly host: StudioHost;
  /** Takes the window off the page and disposes the open workspaces' services. */
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
 * Starts the Studio in a page (`studio.entry`). The desktop app starts on the Welcome screen and
 * opens the folders the user picks, each with its own services, behind the workspace switcher
 * (`studio.open-folder`). The served Studio opens the one workspace it serves. The window is the
 * shell's or the workspace feature's; the app only starts it, as AGENTS.md asks of screens.
 *
 * The desktop app registers the Inbox and Runs, over the runs in each open folder. The served
 * Studio registers no feature yet: nothing serves it runs until `halonic serve` is built, so it
 * shows Home and the Search box.
 *
 * @example
 * startStudio({ element: root, window, userAgent: navigator.userAgent, storage: localStorage });
 */
export function startStudio(page: StudioPage): StartedStudio {
  const host = studioHost(page.window);
  const platform = keyboardPlatform(page.userAgent);
  const ipc = tauriIpc(page.window);
  if (ipc !== undefined) {
    const shell = createShell({ ...desktopFeatures, host, platform });
    return startDesktopApp(page, { shell, ipc, platform });
  }
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

/**
 * The features of the desktop app, and the services the app gives them for each open folder
 * ({@link openFolder}).
 */
export const desktopFeatures = {
  features: [inboxFeature, runsFeature],
  hostServices: [InboxRunsService, RunsSourceService],
};

/** What the desktop app's window is made of. */
interface DesktopParts {
  readonly shell: Shell;
  readonly ipc: TauriIpc;
  readonly platform: KeyboardPlatform;
}

/** The desktop app: Welcome, then the folders the user opens (`studio.open-folder`). */
function startDesktopApp(page: StudioPage, { shell, ipc, platform }: DesktopParts): StartedStudio {
  const switcher = new WorkspaceSwitcher({
    pickFolder: () => pickFolder(ipc),
    openFolder: async (location) => openFolder(shell, page.window, location),
    recent: new RecentWorkspaces(page.storage ?? noStorage),
    toasts: shell.toasts,
  });
  const window = mountWorkspaceWindow(page.element, {
    shell,
    switcher,
    platform,
    language: studioLanguage,
  });
  return {
    host: "desktop-app",
    stop: async () => {
      window.unmount();
      await switcher.dispose();
    },
  };
}

/**
 * Opens the workspace in a folder with services of its own. The OS keychain becomes its secrets
 * and tokens before any feature's services are built, so no token lands in the data folder
 * (threat model 4.4, HAL-2952). In the shell, its runs are the run logs in the folder's run
 * folder, the ones the CLI writes (`studio.workspace-runs`). Its name is the folder's until the
 * workspace's files are read (HAL-3335).
 */
export function openFolder(shell: Shell, window: object, location: string): OpenedWorkspace {
  const name = folderName(location);
  const services = new ServiceRegistry();
  provideShellSecrets(services, window);
  provideWorkspaceRuns(services, window, location);
  shell.services.instantiate(services);
  const workspace = new StudioWorkspace({ toasts: shell.toasts, services, name });
  return { name, workspace, dispose: () => services.dispose() };
}

/**
 * Gives the workspace in `location` its runs, read through the shell, as both the Runs
 * feature's and the Inbox's source. Outside the shell it provides nothing.
 */
function provideWorkspaceRuns(services: ServiceRegistry, window: object, location: string): void {
  const ipc = tauriChannelIpc(window);
  if (ipc === undefined) return;
  const files = {
    invoke: (command: string, args?: Record<string, unknown>) => ipc.invoke(command, args),
    openChannel: (onMessage: (message: unknown) => void) => new TauriChannel(ipc, onMessage),
  };
  const runs = new WorkspaceRuns({
    runs: new TauriRunStore(ipc, location),
    definitions: new TauriDefinitionStore(files, location),
    onFocus: (listener) => focusOf(window, listener),
  });
  services.provide(RunsSourceService, runs);
  services.provide(InboxRunsService, runs);
}

/** Calls `listener` whenever the page's window comes to the front; returns a function that stops it. */
function focusOf(window: object, listener: () => void): () => void {
  if (!(window instanceof EventTarget)) return () => {};
  window.addEventListener("focus", listener);
  return () => window.removeEventListener("focus", listener);
}

/** The shell's folder picker: the picked folder's location, or `undefined` when cancelled. */
async function pickFolder(ipc: TauriIpc): Promise<string | undefined> {
  const picked = await ipc.invoke("pick_folder");
  return typeof picked === "string" ? picked : undefined;
}

/** Recent on a page without storage: nothing is remembered. */
const noStorage: RecentStorage = {
  getItem: () => null,
  setItem: () => {},
};
