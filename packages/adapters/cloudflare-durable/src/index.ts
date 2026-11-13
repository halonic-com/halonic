/**
 * Public entry point of `@halonicjs/adapter-cloudflare-durable`: the
 * `Coordination` port in a Cloudflare Durable Object. The Worker exports
 * {@link CoordinationObject} under its class name and passes the bound
 * namespace to {@link DurableCoordination}.
 */

export { durableObjectClassNames } from "./class-names.ts";
export { CoordinationObject } from "./coordination-object.ts";
export {
  CoordinationState,
  type StateStorage,
  type StateTransaction,
} from "./coordination-state.ts";
export {
  type CoordinationNamespace,
  DurableCoordination,
  type DurableCoordinationOptions,
  defaultCoordinationObjectName,
} from "./durable-coordination.ts";
export {
  DurableScheduler,
  type DurableSchedulerOptions,
  type RunObjectNamespace,
} from "./durable-scheduler.ts";
export { defaultRoutinesObjectName, RoutinesObject } from "./routines-object.ts";
export { RunObject } from "./run-object.ts";
export type { RunHealth, RunObjectApi } from "./run-object-api.ts";
export type { RunListSink } from "./run-state.ts";
export {
  defaultOverdueAfterMs,
  defaultQuietAfterMs,
  type WakeReason,
  Watchdog,
  type WatchdogOptions,
  type WatchdogReport,
  type WokenRun,
  watchdogTimerId,
  whyStuck,
} from "./watchdog.ts";
