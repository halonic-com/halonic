// The public API of @halonicjs/format. Internal code imports by relative path.

export { compact } from "./compact.ts";
export {
  paperclipConnectionKey,
  parsePaperclipConnection,
} from "./connections/paperclip/kind.ts";
export type { PaperclipConnection } from "./connections/paperclip/schema.ts";
export { jsonSchemaOf } from "./json-schema.ts";
export type { FileKind, FilePlace, KindCheckProblem, KindSyntax } from "./kind.ts";
export {
  AGENT_HARNESSES,
  asciiAllowedSites,
  defaultWorkingFolder,
  isInWorkingFolder,
  MAX_ALLOWED_SITES,
  PROTECTED_TOP_NAMES,
  workingFolderProblem,
} from "./kinds/agent/sandbox-fields.ts";
export type { Agent, AgentMethod, AgentOutput, MethodField } from "./kinds/agent/schema.ts";
export {
  type ConnectorStart,
  type FolderLookup,
  type ScriptCandidate,
  scriptCandidates,
  scriptEndings,
  touchesWorkingFolder,
  type WorkingFolderReach,
  workingFolderRefusal,
} from "./kinds/agent/working-folder-start.ts";
export type { Collection, CollectionField, CollectionView } from "./kinds/collection/schema.ts";
export { FIELD_TYPES } from "./kinds/collection/schema.ts";
export { connectorIsLocal, outsideHosts } from "./kinds/connector/is-local.ts";
export {
  approveAll,
  asksBeforeEachUse,
  type Connector,
  marksRead,
  needsApproval,
} from "./kinds/connector/schema.ts";
export {
  connectorIsLocalWith,
  pluginHosts,
  runsInRunner,
  type SheetHosts,
  sheetHostsOf,
} from "./kinds/connector/sheet-hosts.ts";
export type {
  CloudflareSettings,
  Deployment,
  DeploymentLimits,
  Deployments,
} from "./kinds/deployments/schema.ts";
export type {
  CloudMeterSettings,
  ConfigMeterSettings,
  DeploymentUsers,
  Organisation,
  OrganisationMember,
  UsageLimit,
} from "./kinds/deployments/users.ts";
export type { Hub, HubUses } from "./kinds/hub/schema.ts";
export {
  approvedSignIns,
  type ResolvedSignIn,
} from "./kinds/integration/approved-sign-ins.ts";
export { checkIntegrationSheet } from "./kinds/integration/kind.ts";
export { parseIntegrationSheet, type SheetProblem } from "./kinds/integration/parse-sheet.ts";
export {
  type DeclaredClientSecret,
  type DeclaredPlacement,
  type DeclaredSecret,
  type DeclaredSignIn,
  type DeclaredSignInPlacement,
  type IntegrationLimits,
  type IntegrationPolicy,
  integrationPolicy,
  type PolicyProblem,
  type ResolvedIntegration,
} from "./kinds/integration/policy.ts";
export {
  ADDRESS_CLASSES,
  type AddressClass,
  CONTENT_PATH_PATTERN,
  HOST_PATTERN,
  INTEGRATION_NAME_PATTERN,
  type IntegrationClientSecret,
  type IntegrationHost,
  type IntegrationSecret,
  type IntegrationSecretEntry,
  type IntegrationSecretHost,
  IntegrationSheet,
  type IntegrationSignIn,
  type IntegrationTool,
  isPlacedSecret,
  MAX_RESPONSE_BYTES,
  MAX_TIMEOUT_MS,
  placedSecrets,
} from "./kinds/integration/schema.ts";
export { isLocalUrl } from "./kinds/integration/url-host.ts";
export type { KnowledgeSource } from "./kinds/knowledge/schema.ts";
export type { ModelAlias, Models, ProviderRouting } from "./kinds/models/schema.ts";
export { backendSheet, pluginFromIntegrationSheet } from "./kinds/plugin/backend.ts";
export { checkPlugin } from "./kinds/plugin/checks.ts";
export {
  ARGUMENT_NAME_PATTERN,
  DEFAULT_BACKEND_ENTRY,
  ENV_NAME_PATTERN,
  MAX_PLUGIN_ID_LENGTH,
  MAX_PLUGIN_SECRET_NAME_LENGTH,
  NPM_EXACT_VERSION_PATTERN,
  networkSiteProblem,
  Plugin,
  type PluginBackend,
  type PluginLocalTool,
  type PluginUi,
  PYPI_EXACT_VERSION_PATTERN,
  pluginPathProblem,
} from "./kinds/plugin/schema.ts";
export {
  type PluginSettingField,
  type PluginSettingValue,
  settingValueProblem,
} from "./kinds/plugin/setting-values.ts";
export type { Provider } from "./kinds/provider/schema.ts";
export {
  isProviderType,
  openAiCompatibleTypes,
  type ProviderType,
  providerTypes,
  providerTypesInWords,
} from "./kinds/provider/types.ts";
export type { Routine, RoutineTarget, RoutineTrigger } from "./kinds/routine/schema.ts";
export { WEBHOOK_REFUSED_HEADERS } from "./kinds/routine/webhook-headers.ts";
export type { Runtime } from "./kinds/runtime/schema.ts";
export { checkSignal } from "./kinds/signal/checks.ts";
export {
  PR_WATCHER_WAKES,
  type SignalRuleInfo,
  type SignalRuleName,
  signalRuleInfo,
  signalRuleNames,
} from "./kinds/signal/rules.ts";
export type { Signal } from "./kinds/signal/schema.ts";
export type { Skill } from "./kinds/skill/schema.ts";
export {
  type PathLookup,
  skillScriptsRefusal,
  touchesSkillScripts,
} from "./kinds/skill/scripts-folder.ts";
export { MAX_TEMPLATE_CHARS, Template } from "./kinds/template/schema.ts";
export {
  type ActionKey,
  type ActionParameter,
  type ActionParameterShape,
  type FlatValueType,
  type ToolActionInfo,
  type ToolActionName,
  toolActionInfo,
  toolActionNames,
  type WriteModeName,
} from "./kinds/tool/actions.ts";
export { checkTool } from "./kinds/tool/checks.ts";
export type { RepositoryReviewerRules } from "./kinds/tool/reviewer-rules.ts";
export type { Tool, ToolCallers, ToolParameter } from "./kinds/tool/schema.ts";
export type {
  Branch,
  StateType,
  Transition,
  Workflow,
  WorkflowState,
} from "./kinds/workflow/schema.ts";
export type { WorkflowTest, WorkflowTestCase } from "./kinds/workflow-test/schema.ts";
export type { SessionAssistant, WorkspaceSettings } from "./kinds/workspace/schema.ts";
export {
  type FileProblem,
  type IdSource,
  type ParsedFile,
  type ParseFileOptions,
  parseFile,
} from "./parse-file.ts";
export { fileKinds, isKindName, type KindName, type KindValues, kindNames } from "./registry.ts";
export { isReservedPath, RESERVED_FOLDER } from "./reserved.ts";
export { SCHEMA_VERSION } from "./shared/fields.ts";
export { type Guard, isGuard } from "./shared/guard.ts";
export { type NamedPath, type ProgramStart, pathsNamedBy } from "./shared/program-start.ts";
export { foldName } from "./shared/relative-path.ts";
export {
  AGENT_NAME_PATTERN,
  AREA_NAME_PATTERN,
  MAX_ROUTING_AREAS,
  ROUTING_ROLES,
  Routing,
  type RoutingRole,
} from "./snapshot/routing.ts";
export {
  MAX_SNAPSHOT_BYTES,
  MAX_SNAPSHOT_TOOLS,
  SNAPSHOT_FORMAT,
  snapshotJsonSchema,
  WorkspaceSnapshot,
} from "./snapshot/schema.ts";
export { readSignal } from "./snapshot/signals.ts";
export {
  makeSnapshot,
  readSnapshot,
  readSnapshotText,
  type SnapshotInput,
  type SnapshotProblem,
  snapshotText,
} from "./snapshot/snapshot.ts";
