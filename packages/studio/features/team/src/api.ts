import { type ServiceKey, serviceKey } from "@halonicjs/studio-shell";
import type { PullRequests } from "./pull-requests.ts";
import type { SpendAndSeats } from "./spend-and-seats.ts";

/** The Spend and seats screen's reads, built on the engine's `TeamStatus`. */
export const SpendAndSeatsService: ServiceKey<SpendAndSeats> =
  serviceKey<SpendAndSeats>("team.spend-and-seats");

/** The Pull requests screen's reads, built on the engine's `TeamStatus` and the tasks in `AgentMessaging`. */
export const PullRequestsService: ServiceKey<PullRequests> =
  serviceKey<PullRequests>("team.pull-requests");

/**
 * The Spend and seats screen and the reads it takes, loaded only when called. Only for the
 * screenshots CI takes for a reviewer without a browser (`docs/guides/e2e-screenshots.md`), which
 * draw it from a made-up `TeamStatus`. The app never calls it: the feature registers the screen.
 */
export const loadSpendAndSeatsScreen = async () => {
  const [page, reads] = await Promise.all([
    import("./ui/spend-and-seats-page.tsx"),
    import("./spend-and-seats.ts"),
  ]);
  return { SpendAndSeatsPage: page.SpendAndSeatsPage, SpendAndSeats: reads.SpendAndSeats };
};
