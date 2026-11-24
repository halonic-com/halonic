import { type ServiceKey, serviceKey } from "@halonicjs/studio-shell";
import type { PullRequests } from "./pull-requests.ts";
import type { SpendAndSeats } from "./spend-and-seats.ts";

/** The Spend and seats screen's reads, built on the engine's `TeamStatus`. */
export const SpendAndSeatsService: ServiceKey<SpendAndSeats> =
  serviceKey<SpendAndSeats>("team.spend-and-seats");

/** The Pull requests screen's reads, built on the engine's `TeamStatus` and the tasks in `AgentMessaging`. */
export const PullRequestsService: ServiceKey<PullRequests> =
  serviceKey<PullRequests>("team.pull-requests");
