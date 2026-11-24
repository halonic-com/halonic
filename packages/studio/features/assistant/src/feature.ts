import { defineFeature } from "@halonicjs/studio-shell";
import { AssistantHostService, ShowInChatService } from "./api.ts";
import { buildChatsOf } from "./chat/build-chats.ts";
import { showInChat } from "./chat/show-in-chat.ts";

/** Shows or hides the panel, from Ctrl+Alt+I and Ctrl K's "Assistant". */
export const togglePanelCommand = "assistant.panel";

/**
 * The Assistant feature: the side panel with the Build chat (flow-assistant 2.2), its title bar
 * button and Ctrl+Alt+I (5.8), Ctrl K's "Assistant" and "New chat", and Show in chat for the
 * agents and workflows features (5.7). The app provides the Assistant host for each open
 * workspace; without one there is no panel.
 */
export const assistantFeature = defineFeature({
  id: "assistant",
  title: "Assistant",
  needs: [AssistantHostService],
  provides: [ShowInChatService],
  register(studio) {
    studio.services.provide(ShowInChatService, () => showInChat);
    studio.panelWindows.add({
      id: "assistant.panel",
      title: "Assistant",
      order: 10,
      keys: "Ctrl+Alt+I",
      view: "AssistantPanel",
      load: () => import("./panel/assistant-panel.tsx"),
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
        await buildChatsOf(context.services.get(AssistantHostService)).newChat();
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
