import type { FeatureServices } from "./service-catalog.ts";

/**
 * What a feature's `register` receives: the contribution points it plugs
 * into. Each feature gets its own, so the shell knows who contributed what,
 * and it stops working once `register` returns.
 */
export interface Studio {
  /** Provides the services the feature lists in `provides`. */
  readonly services: FeatureServices;
}
