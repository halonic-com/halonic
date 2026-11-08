import type { ServiceLookup } from "./service-catalog.ts";

/**
 * What a contribution's callbacks get: the open workspace's services, limited
 * to the ones the contributing feature lists in `needs` and `provides`.
 * Build one with `shell.services.contextFor`.
 */
export interface WorkspaceContext {
  readonly services: ServiceLookup;
}
