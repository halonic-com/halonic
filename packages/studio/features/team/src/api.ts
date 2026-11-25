import { type ServiceKey, serviceKey } from "@halonicjs/studio-shell";
import type { PullRequests } from "./pull-requests.ts";
import type { SpendAndSeats } from "./spend-and-seats.ts";
import type { TeamDetails } from "./team-details.ts";

/** The Spend and seats screen's reads, built on the engine's `TeamStatus`. */
export const SpendAndSeatsService: ServiceKey<SpendAndSeats> =
  serviceKey<SpendAndSeats>("team.spend-and-seats");

/** The Pull requests screen's reads, built on the engine's `TeamStatus` and the tasks in `AgentMessaging`. */
export const PullRequestsService: ServiceKey<PullRequests> =
  serviceKey<PullRequests>("team.pull-requests");

/** The agent and seat detail pages' reads and Agents by spend's, on `TeamStatus` and `AgentMessaging`. */
export const TeamDetailsService: ServiceKey<TeamDetails> = serviceKey<TeamDetails>("team.details");

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

/**
 * The Pull requests screen and the reads it takes, loaded only when called. Only for the
 * screenshots CI takes for a reviewer (`docs/guides/e2e-screenshots.md`), which draw it from a
 * made-up `TeamStatus`. The app never calls it.
 */
export const loadPullRequestsScreen = async () => {
  const [page, reads] = await Promise.all([
    import("./ui/pull-requests-page.tsx"),
    import("./pull-requests.ts"),
  ]);
  return { PullRequestsPage: page.PullRequestsPage, PullRequests: reads.PullRequests };
};
