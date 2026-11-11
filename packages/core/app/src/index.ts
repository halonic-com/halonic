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
export { describeAgentChange } from "./changes/describe-agent.ts";
export { describeItemChange } from "./changes/describe-item.ts";
export { describeRoutineChange } from "./changes/describe-routine.ts";
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
  ConnectorFactories,
  type ConnectorKind,
  connectorConfigOf,
} from "./connector-factories.ts";
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
export { type MxcLine, mxcLine } from "./doctor-mxc-line.ts";
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
export {
  type IntegrationFolder,
  type IntegrationFolderProblem,
  MAX_INTEGRATION_BYTES,
  MAX_INTEGRATION_ENTRIES,
  readIntegrationFolder,
} from "./integration-folder.ts";
export {
  knowledgeDocForModel,
  knowledgeHitForModel,
  maxKnowledgeRefLength,
} from "./knowledge-for-model.ts";
export {
  type KeptListedTool,
  type RefusedListedTool,
  readListedTool,
} from "./listed-tool.ts";
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
export { escapeListedText, UntrustedText } from "./listed-tool-rules.ts";
export { LiveRoutines, type LiveRoutinesOptions } from "./live-routines.ts";
export { actsAtOnce, type LiveState, type LiveStateInput, liveState } from "./live-state.ts";
export {
  type LiveVersion,
  type LiveVersionReader,
  liveVersionOf,
} from "./live-version.ts";
export {
  type OpenWorkspaceOptions,
  openWorkspace,
  reviewServiceKey,
  workspaceFilesKey,
} from "./open-workspace.ts";
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
export { isPackageManagerVariable } from "./pin-overrides.ts";
export { pinnedRunnerArgs } from "./pinned-args.ts";
export {
  type PluginToolSet,
  type PluginUiContribution,
  trustedPluginTools,
  trustedPluginUi,
} from "./plugin-contributions.ts";
export {
  MAX_PLUGIN_BYTES,
  MAX_PLUGIN_ENTRIES,
  type PluginFolder,
  type PluginProblem,
  type ReadPluginFolderOptions,
  readPluginFolder,
} from "./plugin-folder.ts";
export {
  type PluginInstall,
  type PluginSource,
  pluginInstallsCollection,
} from "./plugin-installs.ts";
export {
  isLocalToolSet,
  type LocalToolOpening,
  type LocalToolSet,
  type LocalToolState,
  type LocalToolUnavailable,
  LocalToolUnavailableError,
  localToolConnectorId,
  PluginLocalTools,
  type PluginLocalToolsOptions,
} from "./plugin-local-tools.ts";
export {
  type AddPluginOptions,
  type BrokenPlugin,
  type DeletePluginSecret,
  type PluginAddRefusal,
  type PluginEntry,
  type PluginRemoveRefusal,
  PluginService,
  type PluginServiceOptions,
  type PluginTrustRefusal,
  type ReadPlugin,
} from "./plugin-service.ts";
export {
  type PluginSettingProblem,
  PluginSettings,
  type PluginSettingValues,
  pluginSettingsCollection,
} from "./plugin-settings.ts";
export type { PluginTrustCheck, PluginTrustSubject } from "./plugin-trust.ts";
export {
  type PluginFileChanges,
  type PluginItemChanges,
  type PluginTrustChanges,
  pluginTrustChanges,
} from "./plugin-trust-changes.ts";
export {
  type PluginFileHash,
  type PluginHostContent,
  type PluginLocalToolContent,
  type PluginPart,
  type PluginSecretContent,
  type PluginToolContent,
  type PluginTrustContent,
  type PluginTrustInput,
  pluginTrustContent,
  pluginTrustFingerprint,
  pluginTrustFingerprintPrefix,
} from "./plugin-trust-content.ts";
export {
  ProgramCopies,
  type ProgramCopyLease,
  ProgramCopyUnavailableError,
  type ProgramCopyVcs,
} from "./program-copies.ts";
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
export type { ReviewCard, ReviewRecord } from "./review-record.ts";
export type { DroppedReviewRecord } from "./review-records.ts";
export { ReviewService, type ReviewServiceOptions } from "./review-service.ts";
export type {
  FileReview,
  ItemToReview,
  LeftOut,
  LeftOutFile,
  ProposedDelete,
  ProposedWrite,
  ProposeOutcome,
  ReviewCheck,
  ReviewedFile,
  ReviewOutcome,
  ReviewStep,
  ReviewTarget,
  Trash,
  TryItSource,
} from "./review-types.ts";
export { ReviewingDefinitionStore } from "./reviewing-store.ts";
export { lastRunKey, lastTickKey, queueKey, routineRunId } from "./routine-ids.ts";
export { type ListedRoutine, RoutineList } from "./routine-list.ts";
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
export type { SkipReason, SkipRecord, TargetUnavailableWhy } from "./routine-skips.ts";
export type { UnavailableTime } from "./routine-targets.ts";
export { type RoutineVersions, routineVersions } from "./routine-versions.ts";
export { type RunEventRefusal, RunEventRefused, RunEvents } from "./run-events.ts";
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
  type ProposalFolderRun,
  ProposalFolders,
  type ProposalFoldersOptions,
} from "./run-proposal-folders.ts";
export type { PartlyDecided, ProposedRecord, Settled } from "./run-proposal-record.ts";
export { isProposalFinished, type SettleResult } from "./run-proposal-settle.ts";
export {
  type AcceptResult,
  type CompareTexts,
  type Decision,
  type FileBase,
  type HistoryOffProposal,
  type HistoryOnProposal,
  type InFileProposalTarget,
  type InFileResult,
  type ProposalFileParts,
  ProposalUnavailableError,
  type ProposedFile,
  type RefusalReason,
  type RejectResult,
  type RunProposal,
  type UndoFileWrite,
  type UndoSource,
  type UndoStep,
  WorkspaceTooBigToCopyError,
} from "./run-proposal-types.ts";
export {
  type ProposalVcs,
  type RunCopies,
  RunProposals,
  type RunProposalsOptions,
  type RunWorktree,
} from "./run-proposals.ts";
export {
  type RunSource,
  type RunSourceInput,
  type RunStartedBy,
  runSourceFor,
  runVersionOf,
} from "./run-source.ts";
export {
  type RunnerFence,
  type RunnerFenceInputs,
  type RunnerUnfencedReason,
  runnerFence,
  runnerUnfencedReasons,
} from "./runner-fence.ts";
export {
  type GatedRunner,
  type GatedStart,
  RunnerStartGate,
  type RunnerStartGateOptions,
  type StartInSandbox,
} from "./runner-start-gate.ts";
export {
  type MxcDefault,
  type MxcSetting,
  type MxcState,
  type MxcStatus,
  mxcDefault,
  mxcStates,
  type SandboxBackend,
  type SandboxBackendId,
  type SandboxChoice,
  type SandboxChoiceOptions,
  SandboxChoiceService,
  type SandboxSettings,
  sandboxBackendIds,
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
export type {
  PersonTrustOrigin,
  TrustRefusal,
  TrustServiceOptions,
} from "./trust-record.ts";
export {
  type TrustCheck,
  TrustService,
  type TrustShrink,
  type TrustSubject,
} from "./trust-service.ts";
export {
  IntegrationNotTrustedError,
  type IntegrationTrustReason,
  TrustedRunnerStart,
  type TrustedRunnerStartOptions,
  type TrustedRunnerSubject,
} from "./trusted-runner-start.ts";
export { UndoHistory, undoLimit } from "./undo-history.ts";
export {
  type StopUnfencedRun,
  type UnfencedRunDecision,
  UnfencedRuns,
  type UnfencedRunsOptions,
} from "./unfenced-runs.ts";
export { fenceEnd, fenceStart, fenceUntrusted } from "./untrusted-fence.ts";
export { type ActiveRun, type Wait, waitsInProgress } from "./waits-in-progress.ts";
export {
  type FollowOptions,
  RunFollowStopped,
  type StartedRun,
  type StartRunOptions,
  WorkflowRuns,
} from "./workflow-runs.ts";
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
