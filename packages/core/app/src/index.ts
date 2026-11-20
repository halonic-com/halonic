// The public API of @halonicjs/app. Everything else in src/ is internal,
// except `listed-tools.ts`, the `@halonicjs/app/listed-tools` entry point.
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
// biome-ignore lint/performance/noReExportAll: keeps the barrel under the file-size limit; the names are listed in that file
export * from "./changes/index.ts";
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
  type CollectionTextError,
  readCollectionName,
  renameCollectionText,
} from "./collection-text.ts";
export {
  CommandBus,
  CommandError,
  type CommandHandler,
  type CommandInput,
  type CommandMap,
  type CommandSpec,
} from "./command-bus.ts";
export { type CommandFinder, commandPaths } from "./command-paths.ts";
export {
  ConnectionSettings,
  type ConnectionSettingsOptions,
  type SendingCheck,
  type SendingSettings,
} from "./connection-settings.ts";
export { connectorBaseEnv, connectorInheritedEnv } from "./connector-base-env.ts";
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
  type SignedOutAgent,
} from "./doctor-checks.ts";
export {
  type DataSpace,
  type DiskLine,
  diskLine,
  type NetworkLine,
  type NetworkProblem,
  type NodeLine,
  type NodeProblem,
  networkLine,
  nodeLine,
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
  type SecretsFound,
  type SecretsLine,
  type SecretUser,
  secretsLine,
  type UsedSecret,
} from "./doctor-secrets-line.ts";
export {
  type DoctorProvider,
  type DoctorReport,
  DoctorService,
  type DoctorServiceOptions,
  type DoctorWorkspace,
} from "./doctor-service.ts";
export {
  type AgentSettingsFolder,
  type DoctorHarness,
  signedOutAgents,
} from "./doctor-sign-ins.ts";
export {
  doctorCheckLimitMs,
  type LimitedCheck,
  type TimedOutLine,
} from "./doctor-time-limit.ts";
export {
  EventBus,
  type EventListener,
  type EventMap,
  type ListenerErrorHandler,
} from "./event-bus.ts";
export { halonicCommand, isWindowsFolder, startRunCommand } from "./halonic-command.ts";
export {
  type HostSetting,
  HostSettings,
  type HostSettingsListener,
  type HostSettingsOptions,
  hostSetting,
} from "./host-settings.ts";
export {
  type HubWorkflow,
  hubWorkflows,
  lookUpWorkflow,
  type WorkflowDefinition,
  type WorkflowLookup,
  workflowIn,
} from "./hub-workflows.ts";
// biome-ignore lint/performance/noReExportAll: keeps the barrel under the file-size limit; the names are listed in that file
export * from "./instruction-trust-exports.ts";
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
  editKnowledgeText,
  type KnowledgeChange,
  type KnowledgeLookupMode,
  type KnowledgeParts,
  type KnowledgeTextError,
  readKnowledgeText,
} from "./knowledge-text.ts";
export { LiveRoutines, type LiveRoutinesOptions } from "./live-routines.ts";
export { actsAtOnce, type LiveState, type LiveStateInput, liveState } from "./live-state.ts";
export {
  type LiveVersion,
  type LiveVersionReader,
  liveVersionOf,
} from "./live-version.ts";
export { integrationsFolder, readLocalIntegrations } from "./local-integrations.ts";
export {
  type DownloadedModelSource,
  detectLocalModels,
  type LocalModels,
  ollamaDownloadedModelSource,
  ollamaDownloadedModels,
} from "./local-models.ts";
// biome-ignore lint/performance/noReExportAll: keeps the barrel under the file-size limit; the names are listed in that file
export * from "./model-choice-exports.ts";
export { defaultCurrency, type MoneyAmountOptions, moneyAmount } from "./money-amount.ts";
export { lastMonths, type MonthSpend, monthOf, monthStartOf, spendByMonth } from "./month-spend.ts";
export {
  type NewAgentsRun,
  newAgentPlacement,
  newAgentsRun,
} from "./new-agent-placement.ts";
export {
  libraryItemPath,
  type NewConnectorTransport,
  type NewLibraryFile,
  type NewLibraryItem,
  type NewLibraryItemError,
  newLibraryFile,
} from "./new-library-item.ts";
// biome-ignore lint/performance/noReExportAll: keeps the barrel under the file-size limit; the names are listed in that file
export * from "./no-sandbox/index.ts";
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
  type PluginBackendChoices,
  PluginBackendNotTrustedError,
  PluginBackendStart,
  type PluginBackendStartOptions,
  type PluginBackendTrustReason,
  PluginSecretNameMissingError,
  pluginBackendChoices,
  type StartTrustedBackend,
  type TrustedPluginBackend,
} from "./plugin-backend.ts";
export {
  type AddPluginCommand,
  type PluginCommands,
  type PluginCommandsHost,
  registerPluginCommands,
  type TrustPluginCommand,
} from "./plugin-commands.ts";
export {
  PluginConnector,
  type PluginConnectorOptions,
  type PluginConnectorPart,
  type PluginPartUnavailable,
  type PluginPartUnavailableReason,
  pluginPartUnavailableReason,
} from "./plugin-connector.ts";
export {
  openPluginConnector,
  type PluginBackendRequest,
  PluginConnectorNotTrustedError,
  type PluginConnectorSources,
} from "./plugin-connector-opening.ts";
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
  type LocalToolConfigInput,
  type LocalToolSettingsNotSet,
  LocalToolSettingsNotSetError,
  localToolConnectorConfig,
} from "./plugin-local-tool-config.ts";
export {
  isLocalToolSet,
  type LocalToolMxc,
  type LocalToolOpening,
  type LocalToolSet,
  type LocalToolState,
  type LocalToolUnavailable,
  LocalToolUnavailableError,
  localToolConnectorId,
  PluginLocalToolNotTrustedError,
  PluginLocalTools,
  type PluginLocalToolsOptions,
} from "./plugin-local-tools.ts";
export { pluginSecretNames } from "./plugin-secret-names.ts";
export {
  type AddedPluginEntry,
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
export {
  declaredSignInTrustFacts,
  type PluginDeclaredHost,
  pluginClientSecretHosts,
  pluginClientSecretNames,
  type SignInTrustFacts,
  signInScopesLine,
  signInTokenHostDiffers,
  signInTokenHostWarning,
  signInTrustLine,
} from "./plugin-sign-in-trust.ts";
export {
  checkPluginTrustNow,
  type PluginStartTrustOptions,
  type PluginStartTrustReason,
  type PluginStartTrustRefusal,
  type TrustedPluginFolder,
} from "./plugin-start-trust.ts";
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
  type PluginSignInContent,
  type PluginToolContent,
  type PluginTrustContent,
  type PluginTrustInput,
  pluginTrustContent,
  pluginTrustFingerprint,
  pluginTrustFingerprintPrefix,
} from "./plugin-trust-content.ts";
export {
  type PluginProgramSecretSource,
  type PluginTrustFiles,
  type PluginTrustSection,
  pluginProgramSecretText,
  pluginTrustFileCap,
  pluginTrustFiles,
  pluginTrustLocationHeadings,
  pluginTrustMoreFilesText,
  pluginTrustSectionHeadings,
  pluginTrustSectionOrder,
  pluginTrustSections,
  pluginTrustToolsIntro,
} from "./plugin-trust-sections.ts";
export {
  ProgramCopies,
  type ProgramCopyLease,
  ProgramCopyUnavailableError,
  type ProgramCopyVcs,
} from "./program-copies.ts";
export { type Reference, referencesTo } from "./references-to.ts";
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
// biome-ignore lint/performance/noReExportAll: keeps the barrel under the file-size limit; the names are listed in that file
export * from "./review-exports.ts";
// biome-ignore lint/performance/noReExportAll: keeps the barrel under the file-size limit; the names are listed in that file
export * from "./run-exports.ts";
// biome-ignore lint/performance/noReExportAll: keeps the barrel under the file-size limit; the names are listed in that file
export * from "./run-proposal-exports.ts";
// biome-ignore lint/performance/noReExportAll: keeps the barrel under the file-size limit; the names are listed in that file
export * from "./sandbox-exports.ts";
export {
  SaveScheduler,
  type SaveSchedulerOptions,
  type SaveTimers,
  type SaveTrigger,
} from "./save-scheduler.ts";
export { type SecretChange, type SecretInput, SecretService } from "./secret-service.ts";
export {
  type Disposable,
  ServiceError,
  type ServiceKey,
  ServiceRegistry,
  serviceKey,
} from "./service-registry.ts";
export {
  editSkillText,
  readSkillText,
  type SkillChange,
  type SkillHeaderField,
  type SkillParts,
  type SkillTextError,
} from "./skill-text.ts";
export { checkToolCall, type ToolCallCheck } from "./tool-call-check.ts";
export {
  type FencedTextsRequest,
  fencedTextsNotice,
  toolForModel,
  toolResultForModel,
} from "./tool-for-model.ts";
export {
  listedToolName,
  type OfferedDeclaredTool,
  type OfferedListedTool,
  type OfferedTool,
  readToolListing,
  type ToolListing,
  type ToolListingInput,
  type ToolRefusal,
  workspaceRisksOf,
} from "./tool-listing.ts";
export { treeCost, treeUnpriced } from "./tree-cost.ts";
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
  type TrustSubjectInput,
  trustContentInputOf,
  trustSubjectOf,
} from "./trust-subject.ts";
export {
  IntegrationNotTrustedError,
  type IntegrationTrustReason,
  TrustedRunnerStart,
  type TrustedRunnerStartOptions,
  type TrustedRunnerSubject,
} from "./trusted-runner-start.ts";
export { UndoHistory, undoLimit } from "./undo-history.ts";
export { fenceEnd, fenceStart, fenceUntrusted } from "./untrusted-fence.ts";
export { type ActiveRun, type Wait, waitsInProgress } from "./waits-in-progress.ts";
export {
  type ItemUsage,
  type LibraryItemKind,
  type LibraryItemRef,
  type Usage,
  whoUses,
} from "./who-uses.ts";
// biome-ignore lint/performance/noReExportAll: keeps the barrel under the file-size limit; the names are listed in that file
export * from "./workspace-exports.ts";
