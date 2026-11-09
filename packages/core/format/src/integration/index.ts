// The public API of @halonicjs/format/integration: the permission sheet for
// the integration kit and the conformance suite. It must not import `yaml`,
// even indirectly; integration-entry.test.ts checks that.

export { checkIntegrationSheet } from "../kinds/integration/kind.ts";
export { parseIntegrationSheet, type SheetProblem } from "../kinds/integration/parse-sheet.ts";
export {
  type IntegrationLimits,
  type IntegrationPolicy,
  integrationPolicy,
  type PolicyProblem,
  type ResolvedIntegration,
} from "../kinds/integration/policy.ts";
export {
  CONTENT_PATH_PATTERN,
  HOST_PATTERN,
  INTEGRATION_NAME_PATTERN,
  type IntegrationHost,
  type IntegrationSecret,
  IntegrationSheet,
  type IntegrationTool,
  MAX_RESPONSE_BYTES,
  MAX_TIMEOUT_MS,
} from "../kinds/integration/schema.ts";
export { backendSheet, pluginFromIntegrationSheet } from "../kinds/plugin/backend.ts";
export { Plugin } from "../kinds/plugin/schema.ts";
