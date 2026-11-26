import type { NoticeTarget } from "./agent-notifications.ts";
import { clickedItem, type ShellClicks, shellClicks } from "./shell-clicks.ts";
import type { TauriCallbacks, TauriIpc } from "./tauri-ipc.ts";

/**
 * The clicks on run notifications that reach Studio's page: the one that opened its window, and
 * those after. Only a run (`run`) or Runs' Failed group (`runs-failed`) comes through.
 */
export type RunNoticeClicks = ShellClicks<NoticeTarget>;

/**
 * The desktop shell's run notification clicks. A notification shown by another page, such as the
 * background service's, has no callback in this page, so this hears the clicks by their kind
 * instead (requirement `runs.run-notification-open`). The click that opened Studio's window comes
 * from `take_pending_notification_click` (`pending_click.rs`).
 *
 * @param ipc - the shell's IPC with its callback table (`tauriChannelIpc`)
 * @param onError - hears a listener or command the shell refused
 */
export function shellRunNoticeClicks(
  ipc: TauriIpc & TauriCallbacks,
  onError: (error: unknown) => void,
): RunNoticeClicks {
  return shellClicks(ipc, onError, {
    takeCommand: "take_pending_notification_click",
    // Studio's window, the only one a run's click goes to.
    windowLabel: "main",
    targetOf: runTargetOf,
  });
}

/** The run or the Failed group `clicked` names, or `undefined` for anything else. */
function runTargetOf(clicked: unknown): NoticeTarget | undefined {
  const item = clickedItem(clicked);
  if (item === undefined) return undefined;
  const { messagingId, kind } = item;
  if (kind !== "run" && kind !== "runs-failed") return undefined;
  return { kind, id: messagingId };
}
