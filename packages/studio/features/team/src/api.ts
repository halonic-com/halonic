import { type ServiceKey, serviceKey } from "@halonicjs/studio-shell";
import type { SpendAndSeats } from "./spend-and-seats.ts";

/** The Spend and seats screen's reads, built on the engine's `TeamStatus`. */
export const SpendAndSeatsService: ServiceKey<SpendAndSeats> =
  serviceKey<SpendAndSeats>("team.spend-and-seats");
