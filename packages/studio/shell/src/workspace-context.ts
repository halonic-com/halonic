import type { Announcer } from "./announcer/announcer.ts";
import type { ServiceLookup } from "./service-catalog.ts";

/**
 * What a contribution's callbacks get: the open workspace's services, limited
 * to the ones the contributing feature lists in `needs` and `provides`, and
 * the window's announcer.
 * Build one with `shell.services.contextFor`.
 */
export interface WorkspaceContext {
  readonly services: ServiceLookup;
  /** Reads text to screen readers; it belongs to the window, not the workspace. */
  readonly announcer: Announcer;
}
