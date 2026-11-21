import { AgentHostSandbox, AgentHostSandboxChoice } from "@halonicjs/adapter-agent-host-client";
import { TauriPickedFolders, TauriTrustStore } from "@halonicjs/adapter-fs-tauri";
import { ServiceRegistry, sandboxStartCheck, sandboxStartCheckKey } from "@halonicjs/app";
import {
  type FilesHost,
  FilesHostService,
  fileItem,
  followFilesHost,
} from "@halonicjs/studio-feature-files/api";
import { SampleWorkspaceService } from "@halonicjs/studio-feature-first-run/api";
import { SandboxPassesService } from "@halonicjs/studio-feature-inbox/api";
import { SampleHintService } from "@halonicjs/studio-feature-runs/api";
import {
  BrowserDisplayPrefs,
  DisplaySettings,
  type DisplayStorage,
  TauriUpdater,
  watchAppearance,
} from "@halonicjs/studio-feature-settings";
import {
  AgentSandboxService,
  DisplaySettingsService,
  HostSettingsService,
  RestartRunsService,
  SandboxChoiceHostService,
  UpdaterService,
} from "@halonicjs/studio-feature-settings/api";
import {
  folderName,
  mountWorkspaceWindow,
  NewWorkspaceAsks,
  type OpenedWorkspace,
  type RecentStorage,
  RecentWorkspaces,
  WorkspaceSwitcher,
} from "@halonicjs/studio-feature-workspace";
import {
  TrustedSourcesService,
  WorkspacePageService,
} from "@halonicjs/studio-feature-workspace/api";
import {
  onWindowCloseRequested,
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
  itemLocationKey,
  type KeyboardPlatform,
  placeNames,
  type Shell,
  type StudioHost,
  StudioWorkspace,
} from "@halonicjs/studio-shell";
import { showEngineLockLost } from "../engine/engine-lock-lost-toast.ts";
import { AgentHostSandboxFacts } from "./agent-sandbox-host.ts";
import { provideAssistant } from "./assistant-workspace.ts";
import { desktopFeatures } from "./desktop-features.ts";
import { watchDesktopResources } from "./desktop-resources.ts";
import { newWorkspaceHostOf } from "./new-workspace-host.ts";
import { observedSandboxStartCheck } from "./observed-sandbox-start-check.ts";
import { openFolderScope, savingOf } from "./open-folder-scope.ts";
import { halonicVersion, openTrustsOf, shellFiles, workspaceTrustOf } from "./open-trusts.ts";
import { provideFolderServices } from "./provide-folder-services.ts";
import { restartRunsOfWindow } from "./restart-runs.ts";
import { sampleHostOf } from "./sample-host.ts";
import { sampleWorkspaceOf } from "./sample-workspace.ts";
import { elevateSetupOf } from "./sandbox-elevate-shell.ts";
import { startServedStudio } from "./served-studio.ts";
import { watchStart } from "./start-watch.ts";

export { servedServices } from "./served-studio.ts";

import { keyboardPlatform, studioHost } from "./studio-host.ts";
import { followSystemRegion } from "./system-region.ts";
import { demoModelWatch } from "./test-model-watch.ts";
import { trustedSourcesOf } from "./trusted-sources.ts";
import {
  closeLimitMs,
  leaveFocusedField,
  windowCloseHandler,
  withinLimit,
} from "./window-close.ts";
import { hostSettingsOf } from "./window-host-settings.ts";
import { WorkspaceTrustView } from "./workspace-trust-control.ts";
import { wslBackupOf } from "./wsl-backup-shell.ts";

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
 * (`studio.open-folder`). The served Studio shows the one workspace the computer serves
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
    const shell = createShell({ ...desktop, host, platform });
    return startDesktopApp(page, { shell, ipc, platform });
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
  const picked = new TauriPickedFolders(ipc);
  const newWorkspaceAsks = new NewWorkspaceAsks();
  const newWorkspace = newWorkspaceOf(page.window, platform);
  const device: DeviceMemory = {
    recent: new RecentWorkspaces(page.storage ?? noStorage),
    storage: page.storage ?? noStorage,
    platform,
    ...(newWorkspace.newWorkspace === undefined
      ? {}
      : { startOwnWorkspace: () => newWorkspaceAsks.ask() }),
  };
  const switcher = new WorkspaceSwitcher({
    pickFolder: () => pickFolder(ipc),
    openFolder: (location) => openFolder(shell, page.window, location, display, device),
    reopenFolder: (location) => picked.reopen(location),
    forgetFolder: (location) => picked.forget(location),
    recent: device.recent,
    toasts: shell.toasts,
  });
  const resources = watchDesktopResources(ipc);
  const start = watchStart(ipc, platform, halonicVersion);
  const parts = {
    shell,
    switcher,
    platform,
    language: studioLanguage,
    resources,
    start,
    ...newWorkspace,
    newWorkspaceAsks,
  };
  const window = mountWorkspaceWindow(page.element, parts);
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
  const stopped = once(async () => {
    stopRegion();
    resources.stop();
    start.stop();
    await stopListening();
    window.unmount();
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
 * The New workspace dialog's host (`studio.new-workspace`) and the sample's (`studio.try-sample`), over the shell's folder and file
 * commands. Without the channel the file commands need, the window has no New workspace row.
 */
function newWorkspaceOf(window: object, platform: KeyboardPlatform) {
  const channelIpc = tauriChannelIpc(window);
  if (channelIpc === undefined) return {};
  const parts = {
    shell: shellFiles(channelIpc),
    separator: platform === "windows" ? ("\\" as const) : ("/" as const),
    trust: async (folder: string) => {
      const trust = workspaceTrustOf(channelIpc, folder);
      await trust.refresh();
      const check = trust.check;
      const fingerprint =
        check === undefined || check.status === "refused" ? undefined : check.fingerprint;
      if (fingerprint === undefined) throw new Error("Halonic couldn't read the new workspace");
      const granted = await trust.grant(fingerprint);
      if (!granted.ok) throw new Error(granted.reason);
    },
  };
  return { newWorkspace: newWorkspaceHostOf(parts), sample: sampleHostOf(parts) };
}

/** What this device remembers across folders: Recent, and the page's storage behind it. */
export interface DeviceMemory {
  readonly recent: RecentWorkspaces;
  readonly storage: RecentStorage;
  /** Opens the New workspace dialog; `undefined` when the window has none. */
  readonly startOwnWorkspace?: () => void;
  /** The computer's operating system; left out, the Studio's words name no program of one. */
  readonly platform?: KeyboardPlatform;
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
  device: DeviceMemory = { recent: new RecentWorkspaces(noStorage), storage: noStorage },
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
  const sample = sampleWorkspaceOf(
    location,
    device.recent,
    device.storage,
    device.startOwnWorkspace,
  );
  services.provide(SampleWorkspaceService, sample);
  services.provide(SampleHintService, sample);
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
  await provideAgentSandbox(services, window, ipc);
  if (ipc !== undefined) {
    services.provide(UpdaterService, updaterOf(ipc));
    services.provide(RestartRunsService, restartRunsOfWindow);
  }
  const assistant = provideAssistant(services, files, location, name, scope);
  if (ipc !== undefined && files !== undefined && trust !== undefined && scope !== undefined) {
    provideFolderServices(services, {
      ipc,
      files,
      window,
      trust,
      askTrust: () => trustView?.asks.ask() ?? Promise.resolve("declined"),
      location,
      platform: device.platform ?? "linux",
      name,
      scope,
      // Run waits through the workspace's own save, which is made below, once the workspace is.
      settle: async () => {
        if (!((await saving?.saveNow()) ?? true))
          throw new Error("The workspace is still unsaved.");
      },
      onEngineLockLost: () =>
        showEngineLockLost({
          toasts: shell.toasts,
          name,
          openRuns: () => workspace.tabs.openHere({ key: "runs", title: placeNames.runs.label }),
        }),
    });
  }
  shell.services.instantiate(services);
  const testModel = demoModelWatch(services, () => device.recent.isSample(location));
  const workspace = new StudioWorkspace({ toasts: shell.toasts, services, name });
  const outside = showFilesOutside(services, shell.toasts, workspace);
  const saving = scope === undefined ? undefined : savingOf(scope, workspace, name, outside.onHeld);
  return {
    name,
    workspace,
    saving,
    trust: trustView,
    testModel,
    dispose: () => {
      if (trust !== undefined) open.delete(trust);
      testModel?.dispose();
      outside.stop();
      assistant?.dispose();
      return scope === undefined ? services.dispose() : scope.close();
    },
  };
}

/**
 * Shows what happens to the workspace's files outside Halonic, as toasts and in the save note, and
 * gives the save the way to tell the Files host about a file it held. Both do nothing without a Files host.
 */
function showFilesOutside(
  services: ServiceRegistry,
  toasts: Shell["toasts"],
  workspace: StudioWorkspace,
): { onHeld: (held: Parameters<FilesHost["noteHeld"]>[0]) => void; stop: () => void } {
  if (!services.has(FilesHostService)) return { onHeld: () => undefined, stop: () => undefined };
  const host = services.get(FilesHostService);
  const stop = followFilesHost({
    host,
    toasts,
    saving: workspace.saving,
    open: (path) =>
      workspace.tabs.openHere({
        key: itemLocationKey(fileItem(path)),
        title: path.slice(path.lastIndexOf("/") + 1),
      }),
  });
  return { onHeld: (held) => host.noteHeld(held), stop };
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
async function provideAgentSandbox(
  services: ServiceRegistry,
  window: object,
  ipc: TauriIpc | undefined,
): Promise<void> {
  const transport = tauriAgentHostTransport(window);
  if (transport === undefined) return;
  // The start check only reads: "Check again" on a run page and in the Inbox works whether or not
  // this build offers the section's setup (D44).
  const { check, passes } = observedSandboxStartCheck(
    sandboxStartCheck(async () => (await AgentHostSandbox.connect(transport)).check()),
  );
  services.provide(sandboxStartCheckKey, check);
  services.provide(SandboxPassesService, passes);
  // The engine's choice only reads, like the start check. Nothing shows it until the real canary
  // lands (HAL-10552, UX W3): until then every backend's trust check fails closed.
  services.provide(SandboxChoiceHostService, new AgentHostSandboxChoice(transport));
  if (agentSandboxOffered)
    services.provide(
      AgentSandboxService,
      new AgentHostSandboxFacts(
        transport,
        undefined,
        undefined,
        () => transport.securityUpdates(),
        ipc === undefined ? undefined : await wslBackupOf(ipc),
        ipc === undefined ? undefined : await elevateSetupOf(ipc),
      ),
    );
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
