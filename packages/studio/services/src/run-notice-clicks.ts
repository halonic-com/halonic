import type { NoticeTarget } from "./agent-notifications.ts";
import type { TauriCallbacks, TauriIpc } from "./tauri-ipc.ts";

/** The shell's event for a click on a notification (`src-tauri/src/notification_clicks.rs`). */
const clickedEvent = "notification-clicked";

/** The shell's command that hands over the click that opened Studio's window (`pending_click.rs`). */
const takeCommand = "take_pending_notification_click";

/** Studio's window, the only one a run's click goes to. */
const windowLabel = "main";

/**
 * The clicks on run notifications that reach Studio's page: the one that opened its window, and
 * those after. Only a run (`run`) or Runs' Failed group (`runs-failed`) comes through.
 */
export interface RunNoticeClicks {
  /**
   * The click that opened the window; `undefined` when none waited or the shell refused. The shell
   * hands it over once, so every call on this object answers the same.
   */
  takePending(): Promise<NoticeTarget | undefined>;
  /** Calls `listener` for every later click. Returns a function that stops the calls. */
  subscribe(listener: (target: NoticeTarget) => void): () => void;
}

/**
 * The desktop shell's run notification clicks. A notification shown by another page, such as the
 * background service's, has no callback in this page, so this hears the clicks by their kind
 * instead (requirement `runs.run-notification-open`).
 *
 * @param ipc - the shell's IPC with its callback table (`tauriChannelIpc`)
 * @param onError - hears a listener or command the shell refused
 */
export function shellRunNoticeClicks(
  ipc: TauriIpc & TauriCallbacks,
  onError: (error: unknown) => void,
): RunNoticeClicks {
  const take = async () => {
    try {
      return runTargetOf(await ipc.invoke(takeCommand));
    } catch (error) {
      onError(error);
      return undefined;
    }
  };
  let pending: Promise<NoticeTarget | undefined> | undefined;
  return {
    takePending() {
      pending ??= take();
      return pending;
    },
    subscribe(listener) {
      const handler = ipc.transformCallback((message) => {
        const target = runTargetOf(payloadOf(message));
        if (target !== undefined) listener(target);
      });
      const listening = ipc.invoke("plugin:event|listen", {
        event: clickedEvent,
        target: { kind: "Window", label: windowLabel },
        handler,
      });
      listening.catch((error: unknown) => {
        ipc.unregisterCallback(handler);
        onError(error);
      });
      return () => {
        ipc.unregisterCallback(handler);
        // A refused listen was reported above and has nothing to stop.
        const stop = (eventId: unknown) =>
          ipc.invoke("plugin:event|unlisten", { event: clickedEvent, eventId });
        listening.then(stop, () => undefined).catch(onError);
      };
    },
  };
}

/** Tauri hands a listener `{ event, id, payload }`. */
function payloadOf(message: unknown): unknown {
  if (typeof message !== "object" || message === null || !("payload" in message)) return undefined;
  return message.payload;
}

/** The run or the Failed group `clicked` names, or `undefined` for anything else. */
function runTargetOf(clicked: unknown): NoticeTarget | undefined {
  if (typeof clicked !== "object" || clicked === null) return undefined;
  if (!("messagingId" in clicked) || !("kind" in clicked)) return undefined;
  const { messagingId, kind } = clicked;
  if (typeof messagingId !== "string" || messagingId === "") return undefined;
  if (kind !== "run" && kind !== "runs-failed") return undefined;
  return { kind, id: messagingId };
}
