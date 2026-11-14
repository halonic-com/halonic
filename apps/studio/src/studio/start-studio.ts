import {
  TauriDefinitionStore,
  type TauriFileShell,
  TauriPickedFolders,
  TauriTrustStore,
  webCryptoDigest,
} from "@halonicjs/adapter-fs-tauri";
import { MemoryHostSettingsStore } from "@halonicjs/adapter-memory";
import {
  openWorkspace,
  ServiceRegistry,
  type WorkspaceScope,
  workspaceFilesKey,
} from "@halonicjs/app";
import { inboxFeature } from "@halonicjs/studio-feature-inbox";
import { InboxRunsService } from "@halonicjs/studio-feature-inbox/api";
import { libraryFeature } from "@halonicjs/studio-feature-library";
import {
  ConnectorStatusHostService,
  ListedToolsHostService,
} from "@halonicjs/studio-feature-library/api";
import { runsFeature } from "@halonicjs/studio-feature-runs";
import { RunsSourceService } from "@halonicjs/studio-feature-runs/api";
import {
  BrowserDisplayPrefs,
  DisplaySettings,
  type DisplayStorage,
  settingsFeature,
  TauriUpdater,
  watchAppearance,
} from "@halonicjs/studio-feature-settings";
import {
  AgentSandboxService,
  AssistantWorkspaceService,
  DisplaySettingsService,
  HostSettingsService,
  RestartRunsService,
  UpdaterService,
} from "@halonicjs/studio-feature-settings/api";
import {
  folderName,
  mountWorkspaceWindow,
  type OpenedWorkspace,
  type RecentStorage,
  RecentWorkspaces,
  WorkspaceSaving,
  WorkspaceSwitcher,
  workspaceFeature,
} from "@halonicjs/studio-feature-workspace";
import {
  TrustedSourcesService,
  WorkspacePageService,
} from "@halonicjs/studio-feature-workspace/api";
import {
  hostSettingsStoreKey,
  provideShellHostSettings,
  provideShellSecrets,
  type TauriCallbacks,
  type TauriIpc,
  tauriAgentHostTransport,
  tauriChannelIpc,
  tauriIpc,
} from "@halonicjs/studio-services";
import {
  createShell,
  type KeyboardPlatform,
  mountStudioWindow,
  type Shell,
  type ShellOptions,
  type StudioHost,
  StudioWorkspace,
} from "@halonicjs/studio-shell";
import { AgentHostSandboxFacts } from "./agent-sandbox-host.ts";
import { provideAssistant } from "./assistant-workspace.ts";
import { newWorkspaceHostOf } from "./new-workspace-host.ts";
import { openTrustsOf, shellFiles, workspaceTrustOf } from "./open-trusts.ts";
import { provideFolderServices } from "./provide-folder-services.ts";
import { restartRunsOfWindow } from "./restart-runs.ts";
import { trustedSourcesOf } from "./trusted-sources.ts";
import { hostSettingsOf } from "./window-host-settings.ts";
import type { WorkspaceTrust } from "./workspace-trust.ts";
import { WorkspaceTrustView } from "./workspace-trust-control.ts";

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
 * The desktop app registers the Inbox and Runs, over the runs in each open folder, Settings
 * (`studio.settings`) and the workspace page (`workspace.page`). The served Studio registers no feature yet: nothing serves it runs until
 * `halonic serve` is built, so it shows Home and the Search box.
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
    const shell = createShell({ ...desktop, host, platform });
    return startDesktopApp(page, { shell, ipc, platform });
  }
  const shell = createShell({ features: [], host, platform });
  const services = servedServices();
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
export const desktopFeatures: Pick<ShellOptions, "features" | "hostServices"> = {
  features: [inboxFeature, libraryFeature, runsFeature, settingsFeature, workspaceFeature],
  hostServices: [
    ConnectorStatusHostService,
    ListedToolsHostService,
    InboxRunsService,
    RunsSourceService,
    DisplaySettingsService,
    HostSettingsService,
    AssistantWorkspaceService,
    WorkspacePageService,
    TrustedSourcesService,
  ],
};

/**
 * The served Studio's services. Without the shell it can't reach the profile, so its host
 * settings are kept in memory, as in the browser demo, until `halonic serve` gives it the
 * server's (HAL-6159 design, section 5). They last until the page is closed.
 */
export function servedServices(): ServiceRegistry {
  const services = new ServiceRegistry();
  services.provide(hostSettingsStoreKey, new MemoryHostSettingsStore());
  return services;
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
  const picked = new TauriPickedFolders(ipc);
  const switcher = new WorkspaceSwitcher({
    pickFolder: () => pickFolder(ipc),
    openFolder: (location) => openFolder(shell, page.window, location, display),
    reopenFolder: (location) => picked.reopen(location),
    forgetFolder: (location) => picked.forget(location),
    recent: new RecentWorkspaces(page.storage ?? noStorage),
    toasts: shell.toasts,
  });
  const window = mountWorkspaceWindow(page.element, {
    shell,
    switcher,
    platform,
    language: studioLanguage,
    ...newWorkspaceOf(page.window, platform),
  });
  return {
    host: "desktop-app",
    stop: async () => {
      window.unmount();
      stopAppearance();
      await switcher.dispose();
    },
  };
}

/**
 * The New workspace dialog's host (`studio.new-workspace`), over the shell's folder and file
 * commands. Without the channel the file commands need, the window has no New workspace row.
 */
function newWorkspaceOf(window: object, platform: KeyboardPlatform) {
  const channelIpc = tauriChannelIpc(window);
  if (channelIpc === undefined) return {};
  const newWorkspace = newWorkspaceHostOf({
    shell: shellFiles(channelIpc),
    separator: platform === "windows" ? "\\" : "/",
    trust: async (folder) => {
      const trust = workspaceTrustOf(channelIpc, folder);
      await trust.refresh();
      const check = trust.check;
      const fingerprint =
        check === undefined || check.status === "refused" ? undefined : check.fingerprint;
      if (fingerprint === undefined) throw new Error("Halonic couldn't read the new workspace");
      const granted = await trust.grant(fingerprint);
      if (!granted.ok) throw new Error(granted.reason);
    },
  });
  return { newWorkspace };
}

/**
 * Opens the workspace in a folder with a scope of its own (`openWorkspace`): the folder's files
 * through the shell's file commands, the assistant's changes to review kept in the profile, and
 * the workspace's save, undo and redo. The OS keychain becomes its secrets and tokens before any
 * feature's services are built, so no token lands in the data folder (threat model 4.4,
 * HAL-2952), and the profile's `settings/host.json` its host settings (HAL-6261). In the shell,
 * its runs are the run logs in the folder's run folder, the ones the CLI writes
 * (`studio.workspace-runs`). Its display settings are the window's `display`, the same for every
 * folder open in it. In the shell, it is checked for trust before it opens, as the CLI checks it
 * (`studio.workspace-trust`): its name is the one in `workspace.yaml`, else the folder's, and the
 * assistant may write more than Halonic items only once a person has trusted what the folder
 * holds. Its host settings are the window's, loaded once (`settings.ai-agent-prefs`). Outside the
 * shell there are no files to open, so the scope has only the services above.
 */
export async function openFolder(
  shell: Shell,
  window: object,
  location: string,
  display: DisplaySettings,
): Promise<OpenedWorkspace> {
  const ipc = tauriChannelIpc(window);
  const files = ipc === undefined ? undefined : shellFiles(ipc);
  const trust = ipc === undefined ? undefined : workspaceTrustOf(ipc, location);
  await trust?.refresh();
  const open = openTrustsOf(shell);
  if (trust !== undefined) open.add(trust);
  const name = trust?.name ?? folderName(location);
  const scope =
    files === undefined || trust === undefined
      ? undefined
      : openFolderScope(files, location, trust);
  const services = scope?.services ?? new ServiceRegistry();
  const trustView = trust === undefined ? undefined : new WorkspaceTrustView(trust, location);
  services.provide(DisplaySettingsService, display);
  services.provide(WorkspacePageService, { name, trust: trustView });
  const trustStore = ipc === undefined ? undefined : new TauriTrustStore(ipc);
  services.provide(
    TrustedSourcesService,
    trustStore === undefined
      ? { list: async () => [], remove: async () => undefined }
      : trustedSourcesOf(
          trustStore,
          async () => {
            await Promise.all([...open].map((each) => each.refresh()));
          },
          (locations) => trustStore.foldersFound(locations),
        ),
  );
  provideShellSecrets(services, window);
  provideShellHostSettings(services, window);
  services.provide(HostSettingsService, await hostSettingsOf(services, window));
  provideAgentSandbox(services, window);
  if (ipc !== undefined) {
    services.provide(UpdaterService, updaterOf(ipc));
    services.provide(RestartRunsService, restartRunsOfWindow);
  }
  const assistant = provideAssistant(services, files, location, name, scope);
  if (ipc !== undefined && files !== undefined && trust !== undefined) {
    provideFolderServices(services, { ipc, files, window, trust, location });
  }
  shell.services.instantiate(services);
  const workspace = new StudioWorkspace({ toasts: shell.toasts, services, name });
  return {
    name,
    workspace,
    saving: scope === undefined ? undefined : savingOf(scope, workspace, name),
    trust: trustView,
    dispose: () => {
      if (trust !== undefined) open.delete(trust);
      assistant?.dispose();
      return scope === undefined ? services.dispose() : scope.close();
    },
  };
}

/**
 * Whether this build offers Settings › Agent sandbox's setup, repair and removal. D44 is still with
 * the board and the answer for 0.1 is (c): no, so the section reads Not available (HAL-1444,
 * 1.1). Set it to `true` when the board says (a); nothing else changes.
 */
export const agentSandboxOffered = false;

/**
 * The page's one updater: the shell keeps each watch channel until the page reloads, so every
 * workspace the window opens shares this one instead of opening its own.
 */
const updaters = new WeakMap<object, TauriUpdater>();

function updaterOf(ipc: TauriIpc & TauriCallbacks): TauriUpdater {
  const known = updaters.get(ipc);
  if (known !== undefined) return known;
  const updater = new TauriUpdater(ipc);
  updaters.set(ipc, updater);
  return updater;
}

/**
 * Gives the section the agent host's sandbox through the shell, when the build offers it and the
 * shell has an agent host. Without it the section reads Not available.
 */
function provideAgentSandbox(services: ServiceRegistry, window: object): void {
  if (!agentSandboxOffered) return;
  const transport = tauriAgentHostTransport(window);
  if (transport !== undefined)
    services.provide(AgentSandboxService, new AgentHostSandboxFacts(transport));
}

/** Saves the scope's files by themselves, through the workspace's save state (`workspace.saves-itself`). */
function savingOf(
  scope: WorkspaceScope,
  workspace: StudioWorkspace,
  name: string,
): WorkspaceSaving {
  return new WorkspaceSaving({
    files: scope.services.get(workspaceFilesKey),
    onChange: (listener) => scope.events.on("files.changed", listener),
    saving: workspace.saving,
    name,
  });
}

/** The workspace's scope over its folder and its review records, which live in the profile. */
function openFolderScope(
  files: TauriFileShell,
  location: string,
  trust: WorkspaceTrust,
): WorkspaceScope {
  const scope = openWorkspace({
    store: new TauriDefinitionStore(files, location),
    reviewRecords: new TauriDefinitionStore(files, location, { folder: "review" }),
    digest: webCryptoDigest,
    isTrusted: () => trust.isTrusted(),
    onListenerError: (error) => console.error(error),
  });
  // A saved change may add something to run, so trust is checked again on what is saved.
  scope.events.on("files.saved", () => void trust.refresh());
  return scope;
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

/** Recent on a page without storage: nothing is remembered. */
const noStorage: RecentStorage = {
  getItem: () => null,
  setItem: () => {},
};
