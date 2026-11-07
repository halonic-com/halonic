/**
 * Public entry point of tooling/check: the rules, so tooling/discover and
 * tests can run them. The command lines live in `cli/`.
 */
export { type CheckContext, loadContext } from "./lib/context.ts";
export {
  featureNamePrefix,
  featuresDirectory,
  folderNamePattern,
  placeOf,
  studioAppDirectory,
} from "./lib/layout.ts";
export { formatProblem, type Problem, Report } from "./lib/problems.ts";
export { findRepoRoot, listWorkspacePackages, readJson } from "./lib/workspace.ts";
export { rules } from "./rules/all.ts";
export { readFeatureList } from "./rules/features.ts";
