import type { ServiceLookup, WorkspaceContext } from "@halonicjs/studio-shell";
import { type AiChats, AssistantHostService, type ChatSummary } from "../api.ts";
import { withAssistantServices } from "../chat/assistant-context.ts";
import { buildChatsOf } from "../chat/build-chats.ts";
import { chatTabItem } from "../chat/chat-tab-item.ts";
import { HomeChatView } from "./home-chat-view.tsx";

/**
 * Home's AI chats (`assistant.home.chats`): the Build chats, newest message first. Home is a place
 * of its own: a chat Home opens leaves the panel and its tab until Home gives it back.
 */
export const aiChats: AiChats = {
  async list(context) {
    const chats = await context.services.get(AssistantHostService).chats();
    return newestFirst(chats.filter((chat) => chat.kind === "build"));
  },
  subscribe(context, listener) {
    // The host reports every change to the list as `chats`, this window's renames and deletes
    // included; a message's own `chat` change or an answer's progress doesn't change the list.
    return context.services.get(AssistantHostService).onDidChange((change) => {
      if (change.kind === "chats") listener();
    });
  },
  async newChat(context) {
    const chat = await context.services.get(AssistantHostService).newChat("build");
    return chat.id;
  },
  open(chatId, context) {
    return buildChatsOf(context.services.get(AssistantHostService)).holdInHome(chatId);
  },
  openInTab(chatId, context) {
    buildChatsOf(context.services.get(AssistantHostService)).moveToTab(chatId);
    context.openItemInNewTab?.(chatTabItem(chatId));
  },
  render(chatId, context, onLeave) {
    return <HomeChatView chatId={chatId} context={context} onLeave={onLeave} />;
  },
};

/** The chats sorted by their last message, newest first; equal times keep the host's order. */
function newestFirst(chats: readonly ChatSummary[]): readonly ChatSummary[] {
  return [...chats].sort((left, right) => right.lastUsedAt.localeCompare(left.lastUsedAt));
}

/** Home's chats for the Home feature's context, reading the host through the Assistant's `services`. */
export function aiChatsOf(services: ServiceLookup): AiChats {
  const ours = (context: WorkspaceContext) => withAssistantServices(context, services);
  return {
    list: (context) => aiChats.list(ours(context)),
    subscribe: (context, listener) => aiChats.subscribe(ours(context), listener),
    newChat: (context) => aiChats.newChat(ours(context)),
    open: (chatId, context) => aiChats.open(chatId, ours(context)),
    openInTab: (chatId, context) => aiChats.openInTab(chatId, ours(context)),
    render: (chatId, context, onLeave) => aiChats.render(chatId, ours(context), onLeave),
  };
}
