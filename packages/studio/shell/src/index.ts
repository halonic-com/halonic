// The public API of @halonicjs/studio-shell. Everything else in src/ is internal.
export { defineFeature, type Feature, type FeatureDefinition } from "./feature.ts";
export type {
  FeatureServices,
  ServiceFactory,
  ServiceLookup,
  ServiceTarget,
} from "./service-catalog.ts";
export { type ServiceKey, serviceKey } from "./service-key.ts";
export { createShell, type Shell, type ShellOptions } from "./shell.ts";
export { ShellError } from "./shell-error.ts";
export type { Studio } from "./studio.ts";
