import { TeamStatusService } from "@halonicjs/studio-services";
import { defineFeature } from "@halonicjs/studio-shell";
import { SpendAndSeatsService } from "./api.ts";
import { SpendAndSeats } from "./spend-and-seats.ts";

/**
 * The Team feature (requirement `team.spend-and-seats`). It offers the Spend
 * and seats screen's reads as `SpendAndSeatsService`, built on the engine's
 * `TeamStatus`; it never sees a provider's own types. The sidebar's Team
 * group, which shows `SpendAndSeatsPage`, comes in its own change.
 */
export const teamFeature = defineFeature({
  id: "team",
  title: "Team",
  // Wanted, not needed: until the engine serves TeamStatus, Studio still opens.
  wants: [TeamStatusService],
  provides: [SpendAndSeatsService],
  register(studio) {
    studio.services.provide(
      SpendAndSeatsService,
      (services) => new SpendAndSeats(services.get(TeamStatusService), { now: () => new Date() }),
    );
  },
});
