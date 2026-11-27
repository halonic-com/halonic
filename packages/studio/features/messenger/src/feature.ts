import {
  AgentActivityService,
  AgentMessagingService,
  MessageReactionsService,
} from "@halonicjs/studio-services";
import { defineFeature } from "@halonicjs/studio-shell";
import { ChatOpensService, MessengerService } from "./api.ts";
import { Messenger } from "./messenger.ts";
import { messengerWords } from "./messenger-words.ts";
import { messengerRailEntry } from "./rail-entry.ts";
import { StoredReadMarks } from "./read-marks.ts";

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
  // AgentActivity the Messenger offers no activity panel. Without the shell's chat hand-overs, as in
  // a browser, quick ask opens no chat here. Without MessageReactions, messages show no reactions.
  wants: [AgentMessagingService, AgentActivityService, MessageReactionsService, ChatOpensService],
  provides: [MessengerService],
  register(studio) {
    studio.rail.add(messengerRailEntry);
    studio.services.provide(
      MessengerService,
      (services) =>
        new Messenger(
          services.get(AgentMessagingService),
          undefined,
          services.find(AgentActivityService),
          // On this device, shared by every window; without storage, for this page only.
          new StoredReadMarks(globalThis.localStorage ?? null),
          services.find(MessageReactionsService),
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
