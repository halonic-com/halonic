import type { MessagingId } from "@halonicjs/ports";
import type { TauriCallbacks, TauriIpc } from "./tauri-ipc.ts";

/** The shell's event for a chat quick ask's box hands over (`src-tauri/src/quick_ask_chat.rs`). */
const openEvent = "open-conversation";

/** The shell's command that hands over the chat that opened Messenger's window. */
const takeCommand = "plugin:quick-ask|take_chat";

/** Messenger's window, the only one the shell hands a chat to. */
const windowLabel = "messenger";

/**
 * The chats quick ask's box hands to Messenger's page (Open in Messenger, Answer in Messenger,
 * Last answer ›): the one that opened its window, and those after.
 */
export interface ChatOpens {
  /**
   * The chat that opened the window; `undefined` when none waited or the shell refused. The shell
   * hands it over once, so every call on this object answers the same.
   */
  takePending(): Promise<MessagingId | undefined>;
  /** Calls `listener` with every later chat. Returns a function that stops the calls. */
  subscribe(listener: (conversation: MessagingId) => void): () => void;
}

/**
 * The desktop shell's chat hand-overs to Messenger's window (requirement
 * `messenger.open-from-quick-ask`). Only Messenger's page may take or hear them; the shell refuses
 * the take from any other window.
 *
 * @param ipc - the shell's IPC with its callback table (`tauriChannelIpc`)
 * @param onError - hears a listener or command the shell refused
 */
export function shellChatOpens(
  ipc: TauriIpc & TauriCallbacks,
  onError: (error: unknown) => void,
): ChatOpens {
  const take = async () => {
    try {
      return conversationOf(await ipc.invoke(takeCommand));
    } catch (error) {
      onError(error);
      return undefined;
    }
  };
  let pending: Promise<MessagingId | undefined> | undefined;
  return {
    takePending() {
      pending ??= take();
      return pending;
    },
    subscribe(listener) {
      const handler = ipc.transformCallback((message) => {
        const conversation = conversationOf(payloadOf(message));
        if (conversation !== undefined) listener(conversation);
      });
      const listening = ipc.invoke("plugin:event|listen", {
        event: openEvent,
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
          ipc.invoke("plugin:event|unlisten", { event: openEvent, eventId });
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

/** The chat `opened` names, or `undefined` for anything else. */
function conversationOf(opened: unknown): MessagingId | undefined {
  if (typeof opened !== "object" || opened === null || !("conversation" in opened)) {
    return undefined;
  }
  const { conversation } = opened;
  return typeof conversation === "string" && conversation !== "" ? conversation : undefined;
}
