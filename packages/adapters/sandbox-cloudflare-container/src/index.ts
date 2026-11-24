/**
 * Public entry point of `@halonicjs/adapter-sandbox-cloudflare-container`:
 * the `Sandbox` port on a Cloudflare Container, one container per run. The
 * Worker's container class wraps {@link RunContainerState} around
 * `ctx.container`, and the run passes that class's namespace to
 * {@link ContainerSandbox}.
 */

export { ContainerSandbox, type ContainerSandboxOptions } from "./container-sandbox.ts";
export { type OutboundRoutes, outboundGate, siteAllowed } from "./outbound-gate.ts";
export {
  RunContainerState,
  type RunContainerStateOptions,
  type RunContainerStorage,
} from "./run-container-state.ts";
export type {
  ContainerControl,
  ContainerProcess,
  OutboundRules,
  RunContainer,
  RunContainerCommand,
  RunContainerSetup,
} from "./run-container-types.ts";
