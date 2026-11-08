/**
 * Public entry point of tooling/check: the rules, so tooling/discover and
 * tests can run them. The command lines live in `cli/`.
 */
export { type CheckContext, loadContext } from "./lib/context.ts";
export { type CoverageFloor, defaultCoverageFloors } from "./lib/coverage.ts";
export {
  type AdapterRuntime,
  adapterRuntimes,
  featureNamePrefix,
  featuresDirectory,
  folderNamePattern,
  placeOf,
  studioAppDirectory,
  type TargetKind,
  targetKinds,
} from "./lib/layout.ts";
export { formatProblem, type Problem, Report } from "./lib/problems.ts";
export { findRepoRoot, listWorkspacePackages, owningPackage, readJson } from "./lib/workspace.ts";
export { purposePlaceholder } from "./rules/agents-md.ts";
export { rules } from "./rules/all.ts";
export { readFeatureList } from "./rules/features.ts";
