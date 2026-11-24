import type { AgentMessaging } from "@halonicjs/ports";
import { type ServiceKey, serviceKey } from "@halonicjs/studio-shell";
import type { OverviewStore } from "./overview-store.ts";
import type { RecapStore } from "./recap-store.ts";

export type { Blocker, Overview, OverviewAgent, OverviewWork } from "./overview.ts";
export type { OverviewState, OverviewStore } from "./overview-store.ts";
export type { Recap, RecapOpenItem, RecapWork } from "./recap.ts";
export type { RecapMark, RecapState, RecapStore } from "./recap-store.ts";

/**
 * The `AgentMessaging` the overview reads. `studio/services` provides it
 * from the engine; the overview never sees which provider is behind it.
 */
export const OverviewMessagingService: ServiceKey<AgentMessaging> = serviceKey<AgentMessaging>(
  "overview.agent-messaging",
);

/** The overview, kept up to date with the sources' changes. */
export const OverviewService: ServiceKey<OverviewStore> = serviceKey<OverviewStore>("overview");

/** The daily recap, built when the person opens it. */
export const RecapService: ServiceKey<RecapStore> = serviceKey<RecapStore>("overview.recap");
