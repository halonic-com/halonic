import type { TeamStatus } from "@halonicjs/ports";
import { type ServiceKey, serviceKey } from "@halonicjs/studio-shell";

/**
 * How Studio's Team screens read spend, seat use, pull requests and the merge
 * queue: the engine's `TeamStatus` (requirement `ports.team-status`). Features
 * reach the port only through this key, never through a provider. Where no
 * engine serves it yet, nothing provides it and the Team screens aren't
 * offered. Tests provide a `FakeTeamStatus`.
 */
export const TeamStatusService: ServiceKey<TeamStatus> = serviceKey<TeamStatus>("team-status");
