import { AssistantHostService, type ShowInChat } from "../api.ts";
import { buildChatWords } from "./build-chat-words.ts";
import { buildChatsOf } from "./build-chats.ts";

/**
 * Show in chat (`assistant.chat.show-in-chat`): the item joins the chat the panel shows, else a
 * new Build chat. A closed panel opens on it without taking focus, so you stay where you are.
 */
export const showInChat: ShowInChat = {
  label: buildChatWords.showInChat,
  async show(shown, context) {
    const chats = buildChatsOf(context.services.get(AssistantHostService));
    await chats.showItem(shown);
    const panel = context.panelWindow;
    if (panel === undefined || panel.isOpen()) return;
    chats.keepFocusOnOpen();
    panel.show();
  },
};
