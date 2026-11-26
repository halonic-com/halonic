import { AgentActivityService, AgentMessagingService } from "@halonicjs/studio-services";
import { defineFeature } from "@halonicjs/studio-shell";
import { ChatClicksService, MessengerService } from "./api.ts";
import { Messenger } from "./messenger.ts";
import { messengerWords } from "./messenger-words.ts";

/**
 * The Messenger feature (requirement `messenger.conversations`). It offers
 * the open workspace's {@link Messenger} as `MessengerService`, built on the
 * engine's `AgentMessaging`; it never sees a provider's own types. The
 * Messenger's window, which shows `MessengerPage`, comes in its own change.
 */
export const messengerFeature = defineFeature({
  id: "messenger",
  title: "Messenger",
  // Wanted, not needed: until the engine serves AgentMessaging, Studio still opens. Without
  // AgentActivity the Messenger offers no activity panel. Only Messenger's desktop window gets
  // the shell's handed chats (`messenger.handed-chats`).
  wants: [AgentMessagingService, AgentActivityService, ChatClicksService],
  provides: [MessengerService],
  register(studio) {
    studio.services.provide(
      MessengerService,
      (services) =>
        new Messenger(
          services.get(AgentMessagingService),
          undefined,
          services.find(AgentActivityService),
        ),
    );
    studio.focusedApps.add({
      id: "messenger",
      title: messengerWords.title,
      view: "MessengerWindow",
      load: () => import("./ui/messenger-page.tsx"),
    });
  },
});
