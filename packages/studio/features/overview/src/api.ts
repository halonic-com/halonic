import type { AgentMessaging } from "@halonicjs/ports";
import { type ServiceKey, serviceKey } from "@halonicjs/studio-shell";
import type { OverviewStore } from "./overview-store.ts";

export type { Blocker, Overview, OverviewAgent, OverviewWork } from "./overview.ts";
export type { OverviewState, OverviewStore } from "./overview-store.ts";

/**
 * The `AgentMessaging` the overview reads. `studio/services` provides it
 * from the engine; the overview never sees which provider is behind it.
 */
export const OverviewMessagingService: ServiceKey<AgentMessaging> = serviceKey<AgentMessaging>(
  "overview.agent-messaging",
);

/** The overview, kept up to date with the sources' changes. */
export const OverviewService: ServiceKey<OverviewStore> = serviceKey<OverviewStore>("overview");
