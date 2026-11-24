import { defineFeature } from "@halonicjs/studio-shell";
import { SearchMessagingService, SearchService } from "./api.ts";
import { SearchStore } from "./search-store.ts";

/**
 * The Search feature: one box over agents, chats, messages, inbox items and
 * work from every `AgentMessaging` source (requirement
 * `search.across-sources`). It offers a {@link SearchStore} as
 * `SearchService`; `SearchView` draws it.
 */
export const searchFeature = defineFeature({
  id: "search",
  title: "Search",
  // Until studio/services provides AgentMessaging, nothing reads SearchService, so the app still starts.
  wants: [SearchMessagingService],
  provides: [SearchService],
  register(studio) {
    studio.services.provide(
      SearchService,
      (services) => new SearchStore(services.get(SearchMessagingService)),
    );
  },
});
