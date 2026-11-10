// The public API of @halonicjs/app. Everything else in src/ is internal.
export {
  AgentPlacement,
  type AgentPlacementOptions,
  agentFingerprint,
  agentFingerprintPrefix,
  type PlacementAnswer,
  type PlacementReader,
  type PlacementRefusal,
  type PlacementSubject,
  type SandboxReason,
} from "./agent-placement.ts";
export {
  type ApproveAllResult,
  approveAllShown,
  approveListedTools,
  approveWaitingTool,
  changesBeforeQuiet,
  changeWindowMs,
  keepsChanging,
  type ListedToolApprovalCheck,
  type ListedToolApprovalInput,
  type UnreadableApproval,
  type WaitingTool,
} from "./approve-listed-tools.ts";
export { joinLinesThatNeedEachOther } from "./changes/change-needs.ts";
export { describeWorkflowChange } from "./changes/describe-workflow.ts";
export {
  type ChangeLine,
  type ItemPath,
  type RevertPartsProblem,
  revertParts,
} from "./changes/revert-parts.ts";
export {
  type ChatAnswer,
  type ChatAnswerEnd,
  type ChatAnswerListener,
  type ChatAnswerRequest,
  ChatService,
  type ChatSettings,
  type ChatTool,
  defaultTurnLimit,
  maxTurnLimit,
  minTurnLimit,
} from "./chat-service.ts";
export {
  CommandBus,
  CommandError,
  type CommandHandler,
  type CommandInput,
  type CommandMap,
  type CommandSpec,
} from "./command-bus.ts";
export {
  ConnectionSettings,
  type ConnectionSettingsOptions,
  type SendingCheck,
  type SendingSettings,
} from "./connection-settings.ts";
export {
  checkPinVersion,
  checkResolvedVersion,
  type PinnedPackage,
  type PinRegistry,
} from "./connector-pin.ts";
export {
  type DetectedHarness,
  type DoctorLine,
  type DoctorStatus,
  type DoctorSummary,
  doctorSummary,
  type HarnessAgent,
  type HarnessesLine,
  type HarnessProblem,
  harnessesLine,
  type InstalledHarness,
} from "./doctor-checks.ts";
export {
  type DataSpace,
  type DiskLine,
  diskLine,
  type SandboxLine,
  sandboxLine,
  type WorkspaceLine,
  type WorkspaceTrust,
  workspaceLine,
} from "./doctor-lines.ts";
export {
  type AliasProvider,
  type ModelProblem,
  type ModelProviderState,
  type ModelsLine,
  modelsLine,
  type ProviderReport,
} from "./doctor-models-line.ts";
export {
  type DoctorProvider,
  type DoctorReport,
  DoctorService,
  type DoctorServiceOptions,
  type DoctorWorkspace,
} from "./doctor-service.ts";
export {
  EventBus,
  type EventListener,
  type EventMap,
  type ListenerErrorHandler,
} from "./event-bus.ts";
export {
  type HubWorkflow,
  hubWorkflows,
  lookUpWorkflow,
  type WorkflowDefinition,
  type WorkflowLookup,
  workflowIn,
} from "./hub-workflows.ts";
export { knowledgeDocForModel, knowledgeHitForModel } from "./knowledge-for-model.ts";
export {
  httpToolServer,
  listedToolFingerprint,
  listedToolFingerprintPrefix,
  listedToolText,
  sameToolServer,
  stdioToolServer,
  strictCanonicalJson,
  writtenDigest,
} from "./listed-tool-fingerprint.ts";
export { UntrustedText } from "./listed-tool-rules.ts";
export { type OpenWorkspaceOptions, openWorkspace, workspaceFilesKey } from "./open-workspace.ts";
export {
  checkOutsideRunCall,
  type OutsideRunCall,
  type OutsideRunCheck,
} from "./outside-run-gate.ts";
export {
  checkPackageRunnerLaunch,
  isPackageRunner,
  programName,
  type StdioTransport,
} from "./package-runner.ts";
export { readPackageSpec } from "./package-spec.ts";
export { refusalStatusLine } from "./refusal-status.ts";
export {
  type DataFolder,
  type DataKind,
  type DataUsage,
  type DiskSpace,
  type LoadedModel,
  type LoadedModelSource,
  lowDiskBytes,
  type MemoryUsage,
  type ProviderModels,
  type Reading,
  ResourceReport,
  type ResourceReportOptions,
  type Resources,
} from "./resource-report.ts";
export { lastRunKey, lastTickKey, queueKey, routineRunId } from "./routine-ids.ts";
export type { RoutineOverlap } from "./routine-overlap.ts";
export type { QueuedTimes } from "./routine-queue.ts";
export {
  type DueFunction,
  type RoutineFailure,
  RoutineScheduler,
  type RoutineSchedulerOptions,
  type RoutineStart,
  type RoutineTickResult,
  type RoutineTime,
  type ScheduledRun,
} from "./routine-scheduler.ts";
export {
  defaultRunListLimit,
  type RunDetail,
  RunHistory,
  type RunList,
  type RunListFilter,
  type RunLookup,
  shortRunId,
  shortRunIdLength,
} from "./run-history.ts";
export {
  type RunnerFence,
  type RunnerFenceInputs,
  type RunnerUnfencedReason,
  runnerFence,
  runnerUnfencedReasons,
} from "./runner-fence.ts";
export {
  type Disposable,
  ServiceError,
  type ServiceKey,
  ServiceRegistry,
  serviceKey,
} from "./service-registry.ts";
export { checkToolCall, type ToolCallCheck } from "./tool-call-check.ts";
export { listedToolsNotice, toolForModel, toolResultForModel } from "./tool-for-model.ts";
export {
  listedToolName,
  type OfferedDeclaredTool,
  type OfferedListedTool,
  type OfferedTool,
  readToolListing,
  type ToolListing,
  type ToolListingInput,
  type ToolRefusal,
} from "./tool-listing.ts";
export {
  type PersonTrustOrigin,
  type TrustCheck,
  type TrustRefusal,
  TrustService,
  type TrustServiceOptions,
  type TrustShrink,
  type TrustSubject,
} from "./trust-service.ts";
export { UndoHistory, undoLimit } from "./undo-history.ts";
export {
  type StopUnfencedRun,
  type UnfencedRunDecision,
  UnfencedRuns,
  type UnfencedRunsOptions,
} from "./unfenced-runs.ts";
export { fenceEnd, fenceStart, fenceUntrusted } from "./untrusted-fence.ts";
export { type ActiveRun, type Wait, waitsInProgress } from "./waits-in-progress.ts";
export { type ChangeOptions, type PendingChanges, WorkspaceFiles } from "./workspace-files.ts";
export {
  placedRoutines,
  startOfDueRun,
  type WorkspaceRoutineSchedulerOptions,
  workspaceRoutineScheduler,
} from "./workspace-routines.ts";
export {
  type AppCommands,
  type AppEvents,
  WorkspaceScope,
  type WorkspaceScopeOptions,
} from "./workspace-scope.ts";
