/**
 * Public entry point of `@halonicjs/adapter-cloudflare-durable`: the
 * `Coordination` port in a Cloudflare Durable Object. The Worker exports
 * {@link CoordinationObject} under its class name and passes the bound
 * namespace to {@link DurableCoordination}.
 */

export { durableObjectClassNames } from "./class-names.ts";
export { CoordinationObject } from "./coordination-object.ts";
export {
  type CoordinationNamespace,
  DurableCoordination,
  type DurableCoordinationOptions,
  defaultCoordinationObjectName,
} from "./durable-coordination.ts";
export {
  CoordinationState,
  type StateStorage,
  type StateTransaction,
} from "./coordination-state.ts";
