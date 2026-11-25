import { AgentMessagingService, TeamStatusService } from "@halonicjs/studio-services";
import { defineFeature } from "@halonicjs/studio-shell";
import { PullRequestsService, SpendAndSeatsService, TeamDetailsService } from "./api.ts";
import { PullRequests } from "./pull-requests.ts";
import { SpendAndSeats } from "./spend-and-seats.ts";
import { TeamDetails } from "./team-details.ts";

/**
 * The Team feature (requirements `team.spend-and-seats` and
 * `team.pull-request-stuck`). It offers the Spend and seats screen's reads as
 * `SpendAndSeatsService` and the Pull requests screen's as
 * `PullRequestsService`, and the detail pages' as `TeamDetailsService`, built on the engine's `TeamStatus`; it never sees a
 * provider's own types. It adds the Spend and seats and Pull requests places,
 * which the shell shows under its Team heading, with the problems in Needs you
 * and the stuck PRs as their signals.
 */
export const teamFeature = defineFeature({
  id: "team",
  title: "Team",
  // Wanted, not needed: until the engine serves TeamStatus, Studio still opens.
  wants: [TeamStatusService, AgentMessagingService],
  provides: [SpendAndSeatsService, PullRequestsService, TeamDetailsService],
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
    studio.services.provide(
      TeamDetailsService,
      (services) =>
        new TeamDetails(services.find(TeamStatusService), services.find(AgentMessagingService), {
          now: () => new Date(),
        }),
    );
    studio.places.add({
      id: "team",
      view: "SpendAndSeatsPlace",
      load: () => import("./ui/spend-and-seats-place.tsx"),
      signal: (context) => context.services.get(SpendAndSeatsService).signal(),
      subscribeSignal: (context, listener) =>
        context.services.get(SpendAndSeatsService).watchSignal(listener),
    });
    studio.places.add({
      id: "pull-requests",
      view: "PullRequestsPlace",
      load: () => import("./ui/pull-requests-place.tsx"),
      signal: (context) => context.services.get(PullRequestsService).signal(),
      subscribeSignal: (context, listener) =>
        context.services.get(PullRequestsService).watchSignal(listener),
    });
  },
});
