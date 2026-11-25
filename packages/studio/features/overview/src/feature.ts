import { defineFeature } from "@halonicjs/studio-shell";
import { OverviewMessagingService, OverviewService, RecapService } from "./api.ts";
import { OverviewStore } from "./overview-store.ts";
import { memoryRecapMark, RecapStore, storageRecapMark } from "./recap-store.ts";

/**
 * The Overview feature: who works on what, who is idle, and which work is
 * blocked (requirement `overview.agents-and-work`), and the daily recap
 * (requirement `overview.daily-recap`). It builds an
 * {@link OverviewStore} from `AgentMessaging` and offers it as
 * `OverviewService`, and a {@link RecapStore} as `RecapService`;
 * `OverviewView` and `RecapView` draw them, together on the Overview place
 * under the sidebar's Team group.
 */
export const overviewFeature = defineFeature({
  id: "overview",
  title: "Overview",
  // Until studio/services provides AgentMessaging, nothing reads OverviewService, so the app still starts.
  wants: [OverviewMessagingService],
  provides: [OverviewService, RecapService],
  register(studio) {
    studio.services.provide(
      OverviewService,
      (services) => new OverviewStore(services.get(OverviewMessagingService)),
    );
    studio.services.provide(RecapService, (services) => {
      const mark =
        globalThis.localStorage === undefined
          ? memoryRecapMark()
          : storageRecapMark(globalThis.localStorage);
      return new RecapStore(services.get(OverviewMessagingService), mark);
    });
    studio.places.add({
      id: "overview",
      view: "OverviewPlace",
      load: () => import("./ui/overview-place.tsx"),
    });
  },
});
