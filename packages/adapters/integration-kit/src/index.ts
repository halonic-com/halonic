// The public API of @halonicjs/adapter-integration-kit, published as
// @halonicjs/integration-kit. Internal code imports by relative path.

export {
  type CreatedIntegrationHost,
  createIntegrationHost,
  type IntegrationHostOptions,
} from "./host.ts";
export {
  createLimitedHttpClient,
  type LimitedHttpOptions,
  type RequestLimits,
} from "./limited-http.ts";
export { allowedUrl, type IntegrationPolicy, namePattern } from "./policy.ts";
export { IntegrationRefusedError, IntegrationTimeoutError, type RefusalCode } from "./refused.ts";
export { RequestLog, type RequestLogEntry } from "./request-log.ts";
export { scopedTokens, storedTokenName } from "./scoped-tokens.ts";
export { clampWaitMs, integrationWait } from "./wait.ts";
