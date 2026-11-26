import { ServiceRegistry } from "@halonicjs/app";
import { messengerFeature } from "@halonicjs/studio-feature-messenger";
import { quickAskFeature } from "@halonicjs/studio-feature-quick-ask";
import { AskWindowService } from "@halonicjs/studio-feature-quick-ask/api";
import { type DisplaySettings, watchAppearance } from "@halonicjs/studio-feature-settings";
import { HostSettingsService } from "@halonicjs/studio-feature-settings/api";
import {
  folderName,
  type OpenedWorkspace,
  RecentWorkspaces,
} from "@halonicjs/studio-feature-workspace";
import {
  provideShellHostSettings,
  type TauriIpc,
  tauriAgentHostTransport,
} from "@halonicjs/studio-services";
import {
  createShell,
  type KeyboardPlatform,
  type MountedFocusedWindow,
  mountFocusedWindow,
  type Shell,
  type StudioHost,
  StudioWorkspace,
} from "@halonicjs/studio-shell";
import { provideAgentMessagingReaders } from "../inbox/provide-agent-messaging.ts";
import { desktopAskWindow } from "./desktop-ask-window.ts";
import { noStorage } from "./open-folder.ts";
import { openLast, showStudio } from "./start-focused-app.ts";
import type { StartedStudio, StudioPage } from "./start-studio.ts";
import { hostSettingsOf } from "./window-host-settings.ts";
import { windowLabelOf } from "./window-label.ts";

/** The label the shell gives quick ask's window, which is also its focused app's ID. */
const askBoxLabel = "ask";

/** What quick ask's window is started with, besides its page. */
export interface AskBoxParts {
  readonly ipc: TauriIpc;
  readonly host: StudioHost;
  readonly platform: KeyboardPlatform;
  readonly language: string;
  /** The window's display settings, as Studio's window keeps them. */
  readonly display: DisplaySettings;
}

/** Whether the page is in quick ask's window, the box over other apps. */
export function isAskBoxWindow(window: object): boolean {
  return windowLabelOf(window) === askBoxLabel;
}

/**
 * Starts quick ask's window (`studio.ask-box-window`): only the box, on the Messenger of the
 * workspace Studio last had open. Unlike the other focused apps' windows it doesn't open that
 * workspace: it reads the active account from the host settings and asks through the agent host,
 * and nothing else. So it opens no engine, sends no run notification, reads no files, git or
 * runs, and tells the agent host nothing about its focus, which says nothing about Studio's. With
 * no workspace in Recent, or one that can't be opened, it says to open Halonic, as the others do.
 */
export function startAskBox(page: StudioPage, parts: AskBoxParts): StartedStudio {
  const { ipc, host, platform, language, display } = parts;
  // Only the box and the Messenger it asks through: no other feature's services start here.
  const shell = createShell({
    features: [messengerFeature, quickAskFeature],
    hostServices: [AskWindowService],
    host,
    platform,
  });
  const app = shell.contributions.focusedApps.list().find((each) => each.id === askBoxLabel);
  if (app === undefined) throw new Error("The Quick Ask feature added no focused app `ask`.");
  const stopAppearance = watchAppearance(display, page.element.ownerDocument.documentElement);
  const last = new RecentWorkspaces(page.storage ?? noStorage).list()[0];
  let mounted: MountedFocusedWindow | undefined;
  const opening =
    last === undefined
      ? Promise.resolve(undefined)
      : openLast(ipc, last.location, (location) => openAskBox(shell, page.window, ipc, location));
  const shown = opening.then((opened) => {
    mounted = mountFocusedWindow(page.element, {
      shell,
      app,
      workspace: opened?.workspace,
      language,
      openStudio: () => showStudio(ipc),
    });
    return opened;
  });
  return {
    host: "desktop-app",
    stop: async () => {
      const opened = await shown;
      mounted?.unmount();
      stopAppearance();
      await opened?.dispose();
    },
  };
}

/** The box's services for the workspace at `location`: its host settings, messaging and window. */
async function openAskBox(
  shell: Shell,
  window: object,
  ipc: TauriIpc,
  location: string,
): Promise<OpenedWorkspace> {
  const services = new ServiceRegistry();
  try {
    provideShellHostSettings(services, window);
    // The active account picks the sources the box offers, as in every other window.
    services.provide(HostSettingsService, await hostSettingsOf(services, window));
    provideAgentMessagingReaders(services, tauriAgentHostTransport(window), location);
    services.provide(AskWindowService, desktopAskWindow(ipc));
    shell.services.instantiate(services);
  } catch (error) {
    await services.dispose();
    throw error;
  }
  const name = folderName(location);
  return {
    name,
    workspace: new StudioWorkspace({ toasts: shell.toasts, services, name }),
    dispose: () => services.dispose(),
  };
}
