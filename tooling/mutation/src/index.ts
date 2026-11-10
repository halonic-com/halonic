/** Public entry point of tooling/mutation, for tests and other tooling. */
export {
  belowFloor,
  type MutationReport,
  type MutationScore,
  mutationFloors,
  type PackageResult,
  scoreOf,
  summaryTable,
} from "./score.ts";
export {
  hasCode,
  mutationTargets,
  parityFixturesVariable,
  type StrykerPaths,
  sandboxEnv,
  strykerConfig,
} from "./targets.ts";
