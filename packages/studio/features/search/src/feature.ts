import { defineFeature } from "@halonicjs/studio-shell";
import { SearchMessagingService, SearchService } from "./api.ts";
import { searchForPalette } from "./palette-provider.ts";
import { SearchStore } from "./search-store.ts";

/**
 * The Search feature: one box over agents, chats, messages, inbox items and
 * work from every `AgentMessaging` source (requirement
 * `search.across-sources`). It offers a {@link SearchStore} as
 * `SearchService`; `SearchView` draws it. It also gives Ctrl K and the
 * Search page the sources' agents, inbox items and work (requirement
 * `search.palette`), so a person finds a Paperclip's tasks from the shell.
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
    studio.search.addProvider({
      id: "agent-messaging",
      title: "Agents, inbox and work",
      order: 50,
      search: async (query, context) => {
        // A Studio with no source connected has nothing to find here.
        const messaging = context.services.find(SearchMessagingService);
        return messaging === undefined ? [] : searchForPalette(messaging, query);
      },
    });
  },
});
