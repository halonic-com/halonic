import { ServiceRegistry } from "@halonicjs/app";
import {
  type FilesHost,
  FilesHostService,
  fileItem,
  followFilesHost,
} from "@halonicjs/studio-feature-files/api";
import {
  FirstRunDeviceService,
  SampleWorkspaceService,
} from "@halonicjs/studio-feature-first-run/api";
import { PluginsHostService } from "@halonicjs/studio-feature-plugins/api";
import { SampleHintService } from "@halonicjs/studio-feature-runs/api";
import { type DisplaySettings, TauriUpdater } from "@halonicjs/studio-feature-settings";
import {
  DisplaySettingsService,
  HostSettingsService,
  RestartRunsService,
  UpdaterService,
} from "@halonicjs/studio-feature-settings/api";
import {
  folderName,
  type OpenedWorkspace,
  type RecentStorage,
  RecentWorkspaces,
} from "@halonicjs/studio-feature-workspace";
import {
  TrustedSourcesService,
  WorkspacePageService,
} from "@halonicjs/studio-feature-workspace/api";
import {
  provideShellHostSettings,
  provideShellSecrets,
  ShellNotifier,
  type TauriCallbacks,
  type TauriIpc,
  tauriAgentHostTransport,
  tauriChannelIpc,
} from "@halonicjs/studio-services";
import { itemLocationKey, placeNames, type Shell, StudioWorkspace } from "@halonicjs/studio-shell";
import { showEngineLockLost } from "../engine/engine-lock-lost-toast.ts";
import { openShellEngine } from "../engine/remote-engine.ts";
import { provideFeedbackSettings } from "../feedback/provide-feedback-settings.ts";
import { provideAskKeysSettings } from "../quick-ask/provide-ask-keys-settings.ts";
import { provideKeepAwake, provideRemoteControl } from "../remote/provide-remote.ts";
import { provideRunNotifications } from "../runs/run-notifications-watch.ts";
import { provideAssistant } from "./assistant-workspace.ts";
import type { DeviceMemory } from "./device-memory.ts";
import { firstRunDeviceOf } from "./first-run-device.ts";
import { unfencedRunsOf } from "./integration-runs-status.ts";
import { openFolderScope, savingOf } from "./open-folder-scope.ts";
import { openTrustsOf, shellFiles, workspaceTrustOf } from "./open-trusts.ts";
import { provideAgentSandbox } from "./provide-agent-sandbox.ts";
import { provideFolderServices } from "./provide-folder-services.ts";
import { restartRunsOfWindow } from "./restart-runs.ts";
import { sampleWorkspaceOf } from "./sample-workspace.ts";
import { demoModelWatch } from "./test-model-watch.ts";
import { desktopTrustedSources } from "./trusted-sources.ts";
import { hostSettingsOf } from "./window-host-settings.ts";
import { windowLabelOf } from "./window-label.ts";
import { WorkspaceTrustView } from "./workspace-trust-control.ts";

/** Recent on a page without storage: nothing is remembered. */
export const noStorage: RecentStorage = {
  getItem: () => null,
  setItem: () => {},
};

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
  // The plugins are provided with the folder's services, below.
  const plugins = () =>
    services.has(PluginsHostService) ? services.get(PluginsHostService).feed : undefined;
  const trustView =
    trust === undefined
      ? undefined
      : new WorkspaceTrustView(trust, location, unfencedRunsOf(window), plugins);
  services.provide(DisplaySettingsService, display);
  services.provide(WorkspacePageService, { name, trust: trustView });
  const sample = sampleWorkspaceOf(
    location,
    device.recent,
    device.storage,
    device.startOwnWorkspace,
  );
  services.provide(SampleWorkspaceService, sample);
  services.provide(FirstRunDeviceService, firstRunDeviceOf(location, device));
  services.provide(SampleHintService, sample);
  services.provide(TrustedSourcesService, desktopTrustedSources(window, open));
  provideShellSecrets(services, window);
  provideShellHostSettings(services, window);
  services.provide(HostSettingsService, await hostSettingsOf(services, window));
  const platform = device.platform ?? "linux";
  await provideAgentSandbox(services, window, ipc, platform);
  provideRemoteControl(services, tauriAgentHostTransport(window));
  provideKeepAwake(services, ipc, windowLabelOf(window));
  provideFeedbackSettings(services, ipc, windowLabelOf(window), platform);
  provideAskKeysSettings(services, ipc, windowLabelOf(window), platform);
  if (ipc !== undefined) {
    services.provide(UpdaterService, updaterOf(ipc));
    services.provide(RestartRunsService, restartRunsOfWindow(services));
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
      platform,
      name,
      scope,
      remoteEngine: await openShellEngine(ipc, location),
      engineConnection: shell.engine,
      // Run waits through the workspace's own save, which is made below, once the workspace is.
      settle: async () => {
        if (!((await saving?.saveNow()) ?? true))
          throw new Error("The workspace is still unsaved.");
      },
      onEngineLockLost: (kind) =>
        showEngineLockLost({
          toasts: shell.toasts,
          name,
          kind,
          openRuns: () => workspace.tabs.openHere({ key: "runs", title: placeNames.runs.label }),
        }),
    });
    // A failed run, or one the person started, shows a desktop notification (HAL-18845).
    const reportNotifications = (error: unknown) => console.error("A run notification", error);
    provideRunNotifications(services, {
      notifier: new ShellNotifier(ipc, reportNotifications),
      // Does nothing on purpose: Runs' notice host opens the run, or the Failed group, from the
      // click's kind (`runs.run-notification-open`). Don't wire it again: two openers race, and
      // the Runs list would cover the run's page.
      open: () => undefined,
      onError: reportNotifications,
      trust,
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
