import { MessengerService } from "@halonicjs/studio-feature-messenger/api";
import { defineFeature } from "@halonicjs/studio-shell";
import { AskSessionService, AskWindowService } from "./api.ts";
import { AskMemory, type AskStorage, memoryStorage } from "./ask-memory.ts";
import { AskSession } from "./ask-session.ts";
import { quickAskWords } from "./quick-ask-words.ts";

/**
 * The Quick Ask feature (requirements `quick-ask.session` and `quick-ask.box`). It offers the
 * box's {@link AskSession} as `AskSessionService`, on top of the Messenger, so a question is a
 * normal message in the person's chat with the agent, and adds the focused app `ask`: the box,
 * floating over other apps in the window quick ask's keys show.
 */
export const quickAskFeature = defineFeature({
  id: "quick-ask",
  title: "Quick Ask",
  // Wanted, not needed: a Studio without the Messenger or the box's window still opens.
  wants: [MessengerService, AskWindowService],
  provides: [AskSessionService],
  register(studio) {
    studio.services.provide(
      AskSessionService,
      (services) => new AskSession(services.get(MessengerService), new AskMemory(pageStorage())),
    );
    studio.focusedApps.add({
      id: "ask",
      title: quickAskWords.name,
      view: "AskBoxWindow",
      load: () => import("./ui/ask-window.tsx"),
      floating: true,
    });
  },
});

/** The page's `localStorage`, shared by every window, or storage for this session where there is none. */
function pageStorage(): AskStorage {
  return globalThis.localStorage ?? memoryStorage();
}
