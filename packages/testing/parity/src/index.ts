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
export { type BaseCliCall, baseCliCalls, type CliCall } from "./cli-calls.ts";
export type { AllowedCheck, AllowedFixture } from "./compare/allowed-fixtures.ts";
export {
  type CliCallReport,
  type CliCallResult,
  judgeCliCalls,
} from "./compare/cli-judge.ts";
export {
  type CliComparison,
  type ComparedCall,
  type NewCliCall,
  pairCliCalls,
  readCliRecording,
  type StoredRun,
} from "./compare/cli-output.ts";
export { type CliRule, cliRules } from "./compare/cli-rules.ts";
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
  judgeChecks,
  type ParityReport,
  type StaleFixture,
  type Verdict,
} from "./compare/judge.ts";
export {
  type CheckCase,
  type CheckComparison,
  checkCases,
  checksByFile,
  compareChecks,
} from "./compare/loader-checks.ts";
export {
  judgeRunLogs,
  type RunLogReport,
  type RunLogResult,
  type RunLogVerdict,
  type StaleRunEntry,
} from "./compare/run-judge.ts";
export {
  type ComparedRun,
  type ComparedTest,
  type NewTestRun,
  pairRunLogs,
  type RunLogComparison,
  readRunLogs,
  testName,
} from "./compare/run-logs.ts";
export { type RunRule, runRules } from "./compare/run-rules.ts";
export { composeWorkspace } from "./compose.ts";
export {
  type KnownGap,
  knownGapsFile,
  parseKnownGaps,
  readKnownGaps,
} from "./known-gaps.ts";
export {
  cloneProblems,
  fixedTestTime,
  oldEnvironment,
  oldTsx,
  referenceHash,
  runOldTsx,
} from "./old-repo.ts";
export {
  type CliRecording,
  type FileRecording,
  type FileStatus,
  goldenText,
  type LineVerdict,
  lineVerdict,
  normalise,
  type OldCliRun,
  type OldDiagnostic,
  type OldFile,
  type OldIssue,
  type OldResult,
  type OldRun,
  type OldTestRun,
  type Recording,
  type RunLogs,
  referenceCommit,
  toCliRecording,
  toRecording,
  toRunLogs,
} from "./recording.ts";
