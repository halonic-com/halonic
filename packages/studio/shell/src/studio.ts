import type { CommandPoints } from "./points/command-points.ts";
import type { FramePoints } from "./points/frame-points.ts";
import type { LayoutPoints } from "./points/layout-points.ts";
import type { FeatureServices } from "./service-catalog.ts";

/**
 * What a feature's `register` receives: the contribution points it plugs
 * into. Each feature gets its own, so the shell knows who contributed what,
 * and it stops working once `register` returns.
 */
export interface Studio extends LayoutPoints, FramePoints, CommandPoints {
  /** Provides the services the feature lists in `provides`. */
  readonly services: FeatureServices;
}
