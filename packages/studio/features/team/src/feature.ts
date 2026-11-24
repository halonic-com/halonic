import { AgentMessagingService, TeamStatusService } from "@halonicjs/studio-services";
import { defineFeature } from "@halonicjs/studio-shell";
import { PullRequestsService, SpendAndSeatsService } from "./api.ts";
import { PullRequests } from "./pull-requests.ts";
import { SpendAndSeats } from "./spend-and-seats.ts";

/**
 * The Team feature (requirements `team.spend-and-seats` and
 * `team.pull-request-stuck`). It offers the Spend and seats screen's reads as
 * `SpendAndSeatsService` and the Pull requests screen's as
 * `PullRequestsService`, built on the engine's `TeamStatus`; it never sees a
 * provider's own types. The sidebar's Team group, which shows the pages,
 * comes in its own change.
 */
export const teamFeature = defineFeature({
  id: "team",
  title: "Team",
  // Wanted, not needed: until the engine serves TeamStatus, Studio still opens.
  wants: [TeamStatusService, AgentMessagingService],
  provides: [SpendAndSeatsService, PullRequestsService],
  register(studio) {
    studio.services.provide(
      SpendAndSeatsService,
      // `find`, not `get`: the shell builds services eagerly, and most Studios have no TeamStatus yet.
      (services) => new SpendAndSeats(services.find(TeamStatusService), { now: () => new Date() }),
    );
    studio.services.provide(
      PullRequestsService,
      (services) =>
        new PullRequests(services.find(TeamStatusService), services.find(AgentMessagingService), {
          now: () => new Date(),
        }),
    );
  },
});
