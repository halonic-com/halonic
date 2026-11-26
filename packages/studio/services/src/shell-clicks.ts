import type { TauriCallbacks, TauriIpc } from "./tauri-ipc.ts";

/** The shell's event for a click on a notification (`src-tauri/src/notification_clicks.rs`). */
const clickedEvent = "notification-clicked";

/**
 * The clicks that reach one window's page: the one that opened its window, and those after, each
 * read as a `Target`.
 */
export interface ShellClicks<Target> {
  /**
   * The click that opened the window; `undefined` when none waited or the shell refused. The shell
   * hands it over once, so every call on this object answers the same.
   */
  takePending(): Promise<Target | undefined>;
  /** Calls `listener` for every later click. Returns a function that stops the calls. */
  subscribe(listener: (target: Target) => void): () => void;
}

/** Where a window's clicks come from, and what of them it opens. */
export interface ClickRoute<Target> {
  /** The shell's command that hands over the click that opened the window. */
  readonly takeCommand: string;
  /** The window the shell sends later clicks to. */
  readonly windowLabel: string;
  /** What a click's payload opens in this window, or `undefined` for one it doesn't. */
  readonly targetOf: (clicked: unknown) => Target | undefined;
}

/**
 * One window's clicks from the desktop shell, by `route`. A notification shown by another page has
 * no callback in this page, so this hears the clicks by their kind instead.
 *
 * @param ipc - the shell's IPC with its callback table (`tauriChannelIpc`)
 * @param onError - hears a listener or command the shell refused
 */
export function shellClicks<Target>(
  ipc: TauriIpc & TauriCallbacks,
  onError: (error: unknown) => void,
  route: ClickRoute<Target>,
): ShellClicks<Target> {
  const take = async () => {
    try {
      return route.targetOf(await ipc.invoke(route.takeCommand));
    } catch (error) {
      onError(error);
      return undefined;
    }
  };
  let pending: Promise<Target | undefined> | undefined;
  return {
    takePending() {
      pending ??= take();
      return pending;
    },
    subscribe(listener) {
      const handler = ipc.transformCallback((message) => {
        const target = route.targetOf(payloadOf(message));
        if (target !== undefined) listener(target);
      });
      const listening = ipc.invoke("plugin:event|listen", {
        event: clickedEvent,
        target: { kind: "Window", label: route.windowLabel },
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

/**
 * The `messagingId` and `kind` the shell sends for a click, or `undefined` when `clicked` has no
 * non-empty `messagingId` or no `kind`.
 */
export function clickedItem(clicked: unknown): { messagingId: string; kind: unknown } | undefined {
  if (typeof clicked !== "object" || clicked === null) return undefined;
  if (!("messagingId" in clicked) || !("kind" in clicked)) return undefined;
  const { messagingId, kind } = clicked;
  if (typeof messagingId !== "string" || messagingId === "") return undefined;
  return { messagingId, kind };
}
