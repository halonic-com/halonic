import type { AgentMessaging } from "@halonicjs/ports";
import {
  type AgentNotificationsWatch,
  type NoticeTarget,
  type Notifier,
  type OpenItemWindow,
  openMessagingItem,
  QuietHoursNotifier,
  watchAgentNotifications,
} from "@halonicjs/studio-services";

/** What {@link followAgentNotices} needs besides the agents' messaging and the notifier. */
export interface AgentNoticesOptions {
  /** The window's Inbox and place switcher as they are at the click. */
  window(): OpenItemWindow;
  /** Hears a failed read or a notification the system refused; the watch goes on. */
  onError(error: unknown): void;
}

/**
 * Starts the agents' desktop notifications for one workspace window (requirement
 * `inbox.agent-notifications-start`), held back during quiet hours. A click opens the Inbox on the
 * item it names. No quiet hours are set until Settings has them (HAL-17921).
 *
 * @returns the watch; its `stop` also drops a summary still waiting for quiet hours to end
 */
export function followAgentNotices(
  messaging: AgentMessaging,
  notifier: Notifier,
  options: AgentNoticesOptions,
): AgentNotificationsWatch {
  const quiet = new QuietHoursNotifier(notifier, {
    quietHours: () => undefined,
    onError: options.onError,
  });
  const watch = watchAgentNotifications(messaging, quiet, {
    open: (target) => openTarget(target, options.window()),
    onError: options.onError,
  });
  return {
    ready: watch.ready,
    async stop() {
      await watch.stop();
      quiet.stop();
    },
  };
}

/** Opens an Inbox item; anything else, such as a conversation, has nowhere to open here yet. */
function openTarget(target: NoticeTarget, window: OpenItemWindow): void {
  if (target.kind !== "inbox-item" && target.kind !== "conversation") return;
  openMessagingItem({ id: target.id, kind: target.kind }, window);
}
