import { defineFeature } from "@halonicjs/studio-shell";
import { OverviewMessagingService, OverviewService } from "./api.ts";
import { OverviewStore } from "./overview-store.ts";

/**
 * The Overview feature: who works on what, who is idle, and which work is
 * blocked (requirement `overview.agents-and-work`). It builds an
 * {@link OverviewStore} from `AgentMessaging` and offers it as
 * `OverviewService`; `OverviewView` draws it.
 */
export const overviewFeature = defineFeature({
  id: "overview",
  title: "Overview",
  needs: [OverviewMessagingService],
  provides: [OverviewService],
  register(studio) {
    studio.services.provide(
      OverviewService,
      (services) => new OverviewStore(services.get(OverviewMessagingService)),
    );
  },
});
