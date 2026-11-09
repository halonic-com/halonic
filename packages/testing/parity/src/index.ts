export {
  type AllowedDifference,
  allowedDifferencesFile,
  type DifferenceStatus,
  differenceStatuses,
  parseAllowedDifferences,
  readAllowedDifferences,
} from "./allowed-differences.ts";
export {
  type ExpectedError,
  type Fault,
  faults,
  listFiles,
  loadCases,
  type ParityCase,
  readCase,
} from "./cases.ts";
export type { AllowedFixture } from "./compare/allowed-fixtures.ts";
export {
  type Comparison,
  compareFile,
  type NewProblem,
  type NewResult,
  type Problem,
  type Side,
} from "./compare/compare.ts";
export {
  caseFileChecks,
  type FileCheck,
  fileChecks,
  placeIdOf,
} from "./compare/file-checks.ts";
export {
  type Judged,
  judge,
  type ParityReport,
  type StaleFixture,
  type Verdict,
} from "./compare/judge.ts";
export { composeWorkspace } from "./compose.ts";
export {
  cloneProblems,
  fixedTestTime,
  oldEnvironment,
  oldTsx,
  referenceHash,
} from "./old-repo.ts";
export {
  type FileRecording,
  type FileStatus,
  goldenText,
  type LineVerdict,
  lineVerdict,
  normalise,
  type OldDiagnostic,
  type OldFile,
  type OldIssue,
  type OldResult,
  type OldRun,
  type OldTestRun,
  type Recording,
  type RunLogs,
  referenceCommit,
  toRecording,
  toRunLogs,
} from "./recording.ts";
