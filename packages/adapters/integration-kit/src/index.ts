// The host side of @halonicjs/adapter-integration-kit: the loader, the host
// and its limited client, for Halonic itself. It isn't published; the
// integration entry (`./integration`) is, as @halonicjs/integration-kit.
// The host side takes the error classes from the integration entry, so there
// is one copy of each. (The npm build that keeps that entry outside the
// conformance suite's bundle and points it at the published kit comes in
// HAL-1216's second pull request.) Internal code imports by relative path.

export { declarationProblems } from "./declaration.ts";
export {
  type CreatedIntegrationHost,
  createIntegrationHost,
  type IntegrationHostOptions,
} from "./host.ts";
export {
  IntegrationRefusedError,
  IntegrationTimeoutError,
  type RefusalCode,
} from "./integration/index.ts";
export { leakAttemptCodes } from "./integration/refused.ts";
export {
  createLimitedHttpClient,
  type LimitedHttpOptions,
  type RequestLimits,
} from "./limited-http.ts";
export type { LoadProblem } from "./load-problem.ts";
export {
  type IntegrationSource,
  type LoadedIntegration,
  type LoadIntegrationOptions,
  loadIntegration,
  providerChoices,
  type WorkspaceChoices,
} from "./loader.ts";
export {
  allowedUrl,
  type DeclaredPlacement,
  type DeclaredSecret,
  type IntegrationPolicy,
  namePattern,
} from "./policy.ts";
export { maxRequestBodyBytes } from "./request-body.ts";
export { RequestLog, type RequestLogEntry } from "./request-log.ts";
export { scopedTokens, storedTokenName } from "./scoped-tokens.ts";
export {
  removeSecrets,
  removeSecretsFromHeaders,
  removeSecretsStream,
  type SecretForms,
  type SecretOnWire,
  SecretRemover,
  secretForms,
  secretRemoved,
} from "./secret-filter.ts";
export { clampWaitMs, integrationWait } from "./wait.ts";
