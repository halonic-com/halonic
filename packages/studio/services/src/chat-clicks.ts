import type { MessagingId } from "@halonicjs/ports";
import { clickedItem, type ShellClicks, shellClicks } from "./shell-clicks.ts";
import type { TauriCallbacks, TauriIpc } from "./tauri-ipc.ts";

/**
 * The chats Messenger's window is asked to open: the one quick ask's box opened the window on, and
 * every later chat the box or a conversation's notification hands it.
 */
export type ChatClicks = ShellClicks<MessagingId>;

/**
 * The desktop shell's chats for Messenger's window (requirement `services.chat-clicks`). The chat
 * that opened the window comes from `plugin:quick-ask|take_chat` (`quick_ask_chat.rs`); later
 * ones come as clicks on a `conversation`, sent to the window labelled `messenger`.
 *
 * @param ipc - the shell's IPC with its callback table (`tauriChannelIpc`)
 * @param onError - hears a listener or command the shell refused
 */
export function shellChatClicks(
  ipc: TauriIpc & TauriCallbacks,
  onError: (error: unknown) => void,
): ChatClicks {
  return shellClicks(ipc, onError, {
    takeCommand: "plugin:quick-ask|take_chat",
    windowLabel: "messenger",
    targetOf: chatOf,
  });
}

/** The chat `clicked` names, or `undefined` for anything but a conversation. */
function chatOf(clicked: unknown): MessagingId | undefined {
  const item = clickedItem(clicked);
  return item?.kind === "conversation" ? item.messagingId : undefined;
}
