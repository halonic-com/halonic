import type { ServiceRegistry } from "@halonicjs/app";
import { ChatClicksService } from "@halonicjs/studio-feature-messenger/api";
import { shellChatClicks, type TauriCallbacks, type TauriIpc } from "@halonicjs/studio-services";

/**
 * Gives Messenger's window the chats the desktop shell hands it (`messenger.handed-chats`), such
 * as quick ask's **Open in Messenger**. Only that window gets them: the shell grants
 * `plugin:quick-ask|take_chat` to it alone, and sends its chats to it alone.
 */
export function provideChatClicks(
  services: ServiceRegistry,
  ipc: (TauriIpc & TauriCallbacks) | undefined,
  windowLabel: string | undefined,
): void {
  if (ipc === undefined || windowLabel !== "messenger") return;
  const onError = (error: unknown) => console.error("Opening a chat in Messenger", error);
  services.provide(ChatClicksService, shellChatClicks(ipc, onError));
}
