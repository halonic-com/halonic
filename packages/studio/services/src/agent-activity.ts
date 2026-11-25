import type { TeamStatus } from "@halonicjs/ports";
import { type ServiceKey, serviceKey } from "@halonicjs/studio-shell";

/**
 * What the Messenger's activity panel reads: each connected source's runs
 * (requirement `ports.team-runs`) and pull requests, as the engine's
 * `TeamStatus` gives them. Only these two reads, so a feature can't take it
 * for a whole `TeamStatus`. Read-only by type: no Stop.
 */
export type AgentActivity = Required<Pick<TeamStatus, "runs">> & Pick<TeamStatus, "pullRequests">;

/**
 * How the Messenger's activity panel reads what an agent is doing. Features
 * reach it only through this key, never through a provider. Where no agent
 * host serves it, nothing provides it and the panel isn't offered.
 */
export const AgentActivityService: ServiceKey<AgentActivity> =
  serviceKey<AgentActivity>("agent-activity");
