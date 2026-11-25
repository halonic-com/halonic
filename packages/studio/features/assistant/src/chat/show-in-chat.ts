import type { ServiceLookup } from "@halonicjs/studio-shell";
import { AssistantHostService, type ShowInChat } from "../api.ts";
import { withAssistantServices } from "./assistant-context.ts";
import { buildChatWords } from "./build-chat-words.ts";
import { buildChatsOf } from "./build-chats.ts";
import { chatTabKind } from "./chat-tab-item.ts";

/**
 * Show in chat (`assistant.chat.show-in-chat`): the item joins the chat of the chat tab shown,
 * else the chat the panel shows, else a new Build chat. A closed panel opens on it without taking
 * focus, so you stay where you are; a chat tab stays active.
 */
export const showInChat: ShowInChat = {
  label: buildChatWords.showInChat,
  async show(shown, context) {
    const chats = buildChatsOf(context.services.get(AssistantHostService));
    const active = context.activeItem?.get();
    if (active?.kind === chatTabKind && chats.inTab(active.id)) {
      chats.addShown(active.id, shown);
      return;
    }
    await chats.showItem(shown);
    const panel = context.panelWindow;
    if (panel === undefined || panel.isOpen()) return;
    chats.keepFocusOnOpen();
    panel.show();
  },
};

/** Show in chat for another feature's context, reading the host through the Assistant's `services`. */
export function showInChatOf(services: ServiceLookup): ShowInChat {
  return {
    label: showInChat.label,
    show: (shown, context) => showInChat.show(shown, withAssistantServices(context, services)),
  };
}
