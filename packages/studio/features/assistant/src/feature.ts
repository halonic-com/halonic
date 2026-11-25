import { defineFeature, type WorkspaceContext } from "@halonicjs/studio-shell";
import { AssistantHostService, ItemChatService, ShowInChatService } from "./api.ts";
import { buildChatWords } from "./chat/build-chat-words.ts";
import { buildChatsOf } from "./chat/build-chats.ts";
import { chatTabKind } from "./chat/chat-tab-item.ts";
import { showInChatOf } from "./chat/show-in-chat.ts";
import { itemChatOf } from "./item/item-chat.tsx";

/** Shows or hides the panel, from Ctrl+Alt+I and Ctrl K's "Assistant". */
export const togglePanelCommand = "assistant.panel";

/**
 * The Assistant feature: the side panel with the Build chat (flow-assistant 2.2), its title bar
 * button and Ctrl+Alt+I (5.8), Ctrl K's "Assistant" and "New chat", a chat open as a tab (2.3),
 * Show in chat for the agents and workflows features (5.7), and the chat about one item for the
 * workflows and library features (2.4). The app provides the Assistant
 * host for each open workspace; without one there is no panel.
 */
export const assistantFeature = defineFeature({
  id: "assistant",
  title: "Assistant",
  needs: [AssistantHostService],
  provides: [ShowInChatService, ItemChatService],
  register(studio) {
    // Both keep the Assistant's own lookup: the features that call them can't reach the host.
    studio.services.provide(ShowInChatService, (services) => showInChatOf(services));
    studio.services.provide(ItemChatService, (services) => itemChatOf(services));
    studio.panelWindows.add({
      id: "assistant.panel",
      title: "Assistant",
      order: 10,
      keys: "Ctrl+Alt+I",
      view: "AssistantPanel",
      load: () => import("./panel/assistant-panel.tsx"),
    });
    // A chat tab stays open while its chat is in it: Continue in the side panel and Delete chat
    // close it the way a gone item's tab closes (`shell.gone-item-tabs`).
    studio.itemKinds.add({
      kind: chatTabKind,
      label: buildChatWords.chatKind,
      icon: "assistant",
      open: { view: "ChatTabPage", load: () => import("./tab/chat-tab-page.tsx") },
      tab: {
        describe: (item, context) => {
          const chat = chatsOf(context).viewOf(item.id)?.chat;
          return { label: chat === undefined || chat.draft ? buildChatWords.newChat : chat.title };
        },
        exists: (item, context) => chatsOf(context).inTab(item.id),
        subscribe: (listener, context) => chatsOf(context).subscribe(listener),
      },
    });
    studio.commands.add({
      id: togglePanelCommand,
      title: "Assistant",
      run: (context) => context.panelWindow?.toggle(),
    });
    studio.commands.add({
      id: "assistant.new-chat",
      title: "New chat",
      run: async (context) => {
        await chatsOf(context).newChat();
        context.panelWindow?.show();
      },
    });
    studio.keybindings.add({
      command: togglePanelCommand,
      keys: "Ctrl+Alt+I",
      when: "workspaceFocused",
    });
  },
});

/** The Build chats of the workspace `context` belongs to. */
function chatsOf(context: WorkspaceContext) {
  return buildChatsOf(context.services.get(AssistantHostService));
}
