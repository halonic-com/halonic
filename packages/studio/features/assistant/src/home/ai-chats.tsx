import type { ServiceLookup, WorkspaceContext } from "@halonicjs/studio-shell";
import { type AiChats, AssistantHostService, type ChatSummary } from "../api.ts";
import { withAssistantServices } from "../chat/assistant-context.ts";
import { buildChatsOf } from "../chat/build-chats.ts";
import { chatTabItem } from "../chat/chat-tab-item.ts";
import { ChatTabPage } from "../tab/chat-tab-page.tsx";

/**
 * Home's AI chats (`assistant.home.chats`): the Build chats, newest message first. A chat opened
 * from Home is held as its tab holds it, so the side panel never shows the same chat.
 */
export const aiChats: AiChats = {
  async list(context) {
    const chats = await context.services.get(AssistantHostService).chats();
    return newestFirst(chats.filter((chat) => chat.kind === "build"));
  },
  subscribe(context, listener) {
    const host = context.services.get(AssistantHostService);
    // The host tells of saved changes; the session's chats tell of a rename or delete made here.
    const stopHost = host.onDidChange(listener);
    const stopSession = buildChatsOf(host).subscribe(listener);
    return () => {
      stopHost();
      stopSession();
    };
  },
  async newChat(context) {
    const host = context.services.get(AssistantHostService);
    const chat = await host.newChat("build");
    buildChatsOf(host).moveToTab(chat.id);
    return chat.id;
  },
  open(chatId, context) {
    buildChatsOf(context.services.get(AssistantHostService)).moveToTab(chatId);
  },
  render(chatId, context) {
    return <ChatTabPage item={chatTabItem(chatId)} context={context} Sections={() => null} />;
  },
};

/** The chats sorted by their last message, newest first; equal times keep the host's order. */
export function newestFirst(chats: readonly ChatSummary[]): readonly ChatSummary[] {
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
    render: (chatId, context) => aiChats.render(chatId, ours(context)),
  };
}
