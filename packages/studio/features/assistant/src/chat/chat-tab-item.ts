import type { ItemRef } from "@halonicjs/studio-shell";

/** The item kind of a chat open as a tab (`assistant.chat.open-as-tab`). */
export const chatTabKind = "assistant-chat";

/** The tab of the chat `chatId`: chats aren't files, so their hub is the workspace's own. */
export function chatTabItem(chatId: string): ItemRef {
  return { kind: chatTabKind, hub: "workspace", id: chatId };
}
