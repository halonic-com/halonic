export type { ActionUserCode } from "@halonicjs/adapter-action-send-tauri";
export {
  type ActionPageResult,
  type ActionRecordResult,
  type ActionStepResult,
  type ActionSteps,
  type ActionStepsOptions,
  createActionSteps,
  type DesktopOnly,
  desktopOnlyActionSteps,
  type Recorded,
  type RequestClosed,
  type StepSender,
} from "./action-steps.ts";
export {
  type ActiveAccount,
  ActiveAccountService,
  chooseSource,
  HostActiveAccount,
} from "./active-account.ts";
export { type AgentActivity, AgentActivityService } from "./agent-activity.ts";
export {
  type AgentConnection,
  type AgentConnections,
  AgentConnectionsService,
  type DisconnectResult,
  type SignInChallenge,
  type SignInRefusal,
  type SignInResult,
  type SignInStart,
  signInLimitMs,
} from "./agent-connections.ts";
export {
  AgentHostFeedback,
  type FeedbackSent,
  type FeedbackToSend,
} from "./agent-host-feedback.ts";
export { harnessEnvironments, studioHarnesses } from "./agent-host-harnesses.ts";
export { AgentHostNotAnswering } from "./agent-host-not-answering.ts";
export { TauriAgentHostTransport, tauriAgentHostTransport } from "./agent-host-transport.ts";
export { AgentMessagingService } from "./agent-messaging.ts";
export {
  type AgentNotice,
  type AgentNotificationsOptions,
  type AgentNotificationsWatch,
  type NoticeTarget,
  type Notifier,
  watchAgentNotifications,
} from "./agent-notifications.ts";
export {
  AllRuns,
  type AllRunsState,
  allRunsPollMs,
  type MergedRun,
  type MergedRuns,
  mergeRuns,
  type RunSource,
  type RunSourceFailure,
  type RunSourceName,
  type SourceRead,
} from "./all-runs.ts";
export {
  EngineCallRefused,
  type EngineFetch,
  engineBaseUrl,
  tauriEngineFetch,
} from "./engine-fetch.ts";
export {
  FakeAgentConnections,
  type FakeAgentConnectionsOptions,
} from "./fake-agent-connections.ts";
export {
  HostAgentConnections,
  type HostAgentConnectionsOptions,
  signInPollMs,
} from "./host-agent-connections.ts";
export { MessageReactionsService } from "./message-reactions.ts";
export {
  type InboxOpenRequests,
  inboxKeyOf,
  type MessagingItemKind,
  type MessagingItemToOpen,
  type OpenItemResult,
  type OpenItemWindow,
  openMessagingItem,
} from "./open-messaging-item.ts";
export {
  connectPaperclip,
  disconnectPaperclip,
  type PaperclipConnectResult,
  type PaperclipDisconnectResult,
  type PaperclipKeyEntry,
  paperclipKeyEntryText,
  paperclipKeyTokenName,
} from "./paperclip-key.ts";
export { type RestoreTrust, restoreWhenMayStart } from "./paperclip-restore.ts";
export {
  isQuiet,
  type QuietHours,
  QuietHoursNotifier,
  type QuietHoursOptions,
} from "./quiet-hours.ts";
export { type RunNoticeClicks, shellRunNoticeClicks } from "./run-notice-clicks.ts";
export { scopeToAccount } from "./scope-to-account.ts";
export {
  hostServerEngine,
  type ServerEngine,
  type ServerEngineLeft,
  ServerEngineService,
  type ServerEngineView,
  type ServerPairStart,
  type ServerPairState,
} from "./server-engine.ts";
export { SharedChanges } from "./shared-changes.ts";
export { actionStepsKey, provideActionSteps } from "./shell-actions.ts";
export { type ChatOpens, shellChatOpens } from "./shell-chat-opens.ts";
export { hostSettingsStoreKey, provideShellHostSettings } from "./shell-host-settings.ts";
export {
  publicOnlyShellHttpClient,
  ShellHttpClient,
  type ShellHttpClientOptions,
  shellHttpClient,
} from "./shell-http-client.ts";
export { ShellNotifier } from "./shell-notifications.ts";
export {
  provideShellSecrets,
  secretsKey,
  shellKeychain,
  shellKeyOrigins,
  tokenStoreKey,
} from "./shell-secrets.ts";
export { type SyncDiagnosticsReader, SyncDiagnosticsService } from "./sync-diagnostics.ts";
export { TauriChannel } from "./tauri-channel.ts";
export { onWindowCloseRequested } from "./tauri-close.ts";
export { type TauriCallbacks, type TauriIpc, tauriChannelIpc, tauriIpc } from "./tauri-ipc.ts";
export {
  runAgainFailureWords,
  runAgainNotice,
  runControlWords,
  stopFailureWords,
  TeamRunControlService,
} from "./team-run-control.ts";
export { TeamStatusService } from "./team-status.ts";
