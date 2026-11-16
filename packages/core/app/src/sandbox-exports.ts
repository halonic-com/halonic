// The sandbox part of the public API of @halonicjs/app, re-exported by
// `index.ts` to keep that file under the size limit.
export { type NoSandboxLine, noSandboxLine } from "./doctor-no-sandbox-line.ts";
export {
  type NoSandboxFlagDecision,
  type NoSandboxOptions,
  NoSandboxService,
} from "./no-sandbox.ts";
export {
  mxcFencesLocalTools,
  mxcFencesRunner,
  type RunnerBackend,
  type RunnerFence,
  type RunnerFenceInputs,
  type RunnerUnfencedReason,
  runnerFence,
  runnerUnfencedReasons,
} from "./runner-fence.ts";
export {
  type GatedRunner,
  type GatedStart,
  type MxcFence,
  RunnerStartGate,
  type RunnerStartGateOptions,
  type StartInSandbox,
} from "./runner-start-gate.ts";
export {
  type BackendSetup,
  defaultBackendOrder,
  type LimitCode,
  limitCodes,
  type SandboxBackend,
  type SandboxBackendId,
  type SandboxBackendState,
  type SandboxBackendStatus,
  type SandboxChoice,
  type SandboxChoiceOptions,
  SandboxChoiceService,
  type SecurityUpdatesState,
  sandboxBackendIds,
  sandboxBackendStates,
} from "./sandbox-choice.ts";
export {
  type CanaryFindings,
  runTrustCheck,
  type TrustCanary,
  type TrustCheckFailure,
  type TrustCheckLeak,
  type TrustCheckResult,
  trustCheckFailures,
  trustCheckLeaks,
} from "./sandbox-trust-check.ts";
export {
  type StopUnfencedRun,
  type UnfencedRunDecision,
  UnfencedRuns,
  type UnfencedRunsOptions,
} from "./unfenced-runs.ts";
