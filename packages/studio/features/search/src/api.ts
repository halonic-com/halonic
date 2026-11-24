import type { AgentMessaging } from "@halonicjs/ports";
import { type ServiceKey, serviceKey } from "@halonicjs/studio-shell";
import type { SearchStore } from "./search-store.ts";

export type { SearchKindGroup, SearchSourceGroup } from "./search-results.ts";
export type { SearchState, SearchStore } from "./search-store.ts";

/**
 * The `AgentMessaging` search reads. `studio/services` provides it from the
 * engine; search never sees which provider is behind it.
 */
export const SearchMessagingService: ServiceKey<AgentMessaging> =
  serviceKey<AgentMessaging>("search.agent-messaging");

/** Search across every source's agents, chats, messages, inbox items and work. */
export const SearchService: ServiceKey<SearchStore> = serviceKey<SearchStore>("search");
