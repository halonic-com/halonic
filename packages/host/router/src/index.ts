// The public API of @halonicjs/host-router. Everything else in src/ is internal.

export {
  type CatalogEntry,
  type CatalogFile,
  type CatalogProblem,
  type CatalogTexts,
  catalogFileNames,
  loadCatalog,
  type ProviderCatalog,
} from "./catalog.ts";
export {
  type HealthRuleHit,
  type HealthRuleResult,
  removeUnhealthyWorkflows,
  type WorkflowAliases,
} from "./health-rule.ts";
export { priceVersionOf } from "./price-version.ts";
export {
  type CallResult,
  defaultHealthLimits,
  type HealthLimits,
  ProviderHealth,
} from "./provider-health.ts";
export {
  type AliasStatus,
  aliasStatuses,
  type DataClass,
  dataClasses,
  type RouterAliasFields,
} from "./router-extension.ts";
export { aliasForRun, type PinnedRouting, pinnedRouting } from "./run-alias.ts";
export {
  providerDownCause,
  type RouteOutcomeRow,
  type RunOutcome,
  routeOutcomeOf,
  type SkipReason,
} from "./run-outcome.ts";
export type { RoutingStamp, RunRecord } from "./run-record.ts";
