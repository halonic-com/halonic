import { AgentHostPaperclipSignIn } from "@halonicjs/adapter-agent-host-client";
import { type HostSettings, ServiceRegistry } from "@halonicjs/app";
import {
  type FeedbackDetails,
  type FeedbackSender,
  type FeedbackStore,
  type InAppFeedbackParts,
  IndexedDbFeedbackStore,
  pageOutboxLock,
  startInAppFeedback,
  webOutboxLock,
} from "@halonicjs/studio-feature-feedback";
import { feedbackPrefs } from "@halonicjs/studio-feature-feedback/api";
import type { OpenedWorkspace } from "@halonicjs/studio-feature-workspace";
import {
  AgentConnectionsService,
  AgentHostFeedback,
  provideShellHostSettings,
  type TauriIpc,
  tauriAgentHostTransport,
} from "@halonicjs/studio-services";
import type { KeyboardPlatform } from "@halonicjs/studio-shell";
import { halonicVersion } from "../studio/open-trusts.ts";
import { hostSettingsOf } from "../studio/window-host-settings.ts";
import { FolderFeedbackSender } from "./folder-feedback-sender.ts";
import { MainWindowFeedback, type ShownFolder } from "./main-window-feedback.ts";

/** The main window's open folders, as its workspace switcher keeps them. */
export interface MainWindowFolders {
  readonly shown: { readonly location: string; readonly value: OpenedWorkspace } | undefined;
  subscribe(listener: () => void): () => void;
}

/**
 * Send feedback for Studio's main window: through the shown folder's Paperclip connection, with
 * the waiting feedback in the page's IndexedDB under the Web Lock every window shares.
 */
export function mainWindowFeedbackOf(
  page: { readonly window: object },
  parts: {
    readonly folders: () => MainWindowFolders;
    readonly toasts: InAppFeedbackParts["toasts"];
    readonly openTask: (taskUrl: string) => void;
  },
): MainWindowFeedback {
  const window = page.window as Partial<Pick<Window, "indexedDB" | "navigator">>;
  const transport = tauriAgentHostTransport(page.window);
  const locks = window.navigator?.locks;
  let opened: Promise<FeedbackStore> | undefined;
  return new MainWindowFeedback({
    shown: () => shownFolderOf(parts.folders().shown),
    subscribeShown: (listener) => parts.folders().subscribe(listener),
    senderFor: (location, connection): FeedbackSender =>
      transport === undefined
        ? { send: async () => ({ kind: "not-connected" }) }
        : new FolderFeedbackSender(
            {
              listed: () => new AgentHostPaperclipSignIn(transport, location).listed(),
              send: (feedback) => new AgentHostFeedback(transport).send(feedback),
            },
            connection,
          ),
    store: () => {
      if (window.indexedDB === undefined) return Promise.reject(new Error("No IndexedDB here."));
      opened ??= IndexedDbFeedbackStore.open(window.indexedDB);
      // A store that couldn't open is opened again next time.
      opened.catch(() => {
        opened = undefined;
      });
      return opened;
    },
    lock: locks === undefined ? pageOutboxLock() : webOutboxLock(locks),
    toasts: parts.toasts,
    openTask: parts.openTask,
    log: (text, error) => (error === undefined ? console.warn(text) : console.error(text, error)),
  });
}

function shownFolderOf(shown: MainWindowFolders["shown"]): ShownFolder | undefined {
  if (shown === undefined) return undefined;
  const services = shown.value.workspace.services;
  const connections = services.has(AgentConnectionsService)
    ? services.get(AgentConnectionsService)
    : undefined;
  return { location: shown.location, connections };
}

/**
 * Starts the feedback shortcut in Studio's main window (`feedback.in-app`). The window hears the
 * shortcut only while it is focused and Studio is connected to Paperclip, and the selection overlay
 * and then the Send feedback dialog show inside it; Halonic Inbox and Halonic Messenger don't hear
 * it, as they can't send (HAL-19671). The shortcut, the project and the assignee are read from the
 * window's host settings when they're needed, so a change in Settings counts at once. Each
 * feedback goes through `feedback`, and its toasts show in the window's `toasts`; Help and Ctrl K
 * begin one through `feedback` too (`feedback.help-send-feedback`). Gives the stop.
 */
export function startWindowFeedback(
  page: { readonly window: object },
  ipc: TauriIpc,
  platform: KeyboardPlatform,
  toasts: InAppFeedbackParts["toasts"],
  feedback: MainWindowFeedback,
): () => void {
  const window = page.window as Window;
  if (typeof window.addEventListener !== "function" || window.document === undefined) {
    return () => undefined;
  }
  const services = new ServiceRegistry();
  provideShellHostSettings(services, page.window);
  let settings: HostSettings | undefined;
  void hostSettingsOf(services, page.window).then((loaded) => {
    settings = loaded;
  });
  const read = (setting: (typeof feedbackPrefs)[keyof typeof feedbackPrefs]) =>
    settings?.loaded === true ? settings.get(setting) : setting.fallback;
  const stopSending = feedback.start(window);
  const inApp = startInAppFeedback({
    ipc,
    platform,
    window,
    shortcut: () => read(feedbackPrefs.shortcut),
    details: (): FeedbackDetails => ({
      project: read(feedbackPrefs.project),
      assignee: read(feedbackPrefs.assignee),
      studioVersion: halonicVersion,
      mac: platform === "macos",
      now: () => new Date(),
    }),
    send: feedback.send,
    toasts,
    connected: feedback,
  });
  feedback.beginWith(inApp.start);
  return () => {
    inApp.stop();
    stopSending();
  };
}
