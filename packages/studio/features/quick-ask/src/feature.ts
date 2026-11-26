import { MessengerService } from "@halonicjs/studio-feature-messenger/api";
import { defineFeature } from "@halonicjs/studio-shell";
import { AskSessionService } from "./api.ts";
import { AskMemory, type AskStorage, memoryStorage } from "./ask-memory.ts";
import { AskSession } from "./ask-session.ts";

/**
 * The Quick Ask feature (requirement `quick-ask.session`). It offers the box's
 * {@link AskSession} as `AskSessionService`, on top of the Messenger, so a question is a normal
 * message in the person's chat with the agent. The box's window and its key come in later changes.
 */
export const quickAskFeature = defineFeature({
  id: "quick-ask",
  title: "Quick Ask",
  // Wanted, not needed: a Studio without the Messenger still opens.
  wants: [MessengerService],
  provides: [AskSessionService],
  register(studio) {
    studio.services.provide(
      AskSessionService,
      (services) => new AskSession(services.get(MessengerService), new AskMemory(pageStorage())),
    );
  },
});

/** The page's `localStorage`, shared by every window, or storage for this session where there is none. */
function pageStorage(): AskStorage {
  return globalThis.localStorage ?? memoryStorage();
}
