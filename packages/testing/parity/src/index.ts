export {
  type AllowedDifference,
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
export {
  type Comparison,
  compareFile,
  type NewProblem,
  type NewResult,
  type Problem,
  type Side,
} from "./compare/compare.ts";
export { type FileCheck, fileChecks, placeIdOf } from "./compare/file-checks.ts";
export { composeWorkspace } from "./compose.ts";
export { cloneProblems, oldEnvironment, oldTsx, referenceHash } from "./old-repo.ts";
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
  type Recording,
  referenceCommit,
  toRecording,
} from "./recording.ts";
