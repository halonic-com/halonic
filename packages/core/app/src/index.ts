// The public API of @halonicjs/app. Everything else in src/ is internal.
export {
  CommandBus,
  CommandError,
  type CommandHandler,
  type CommandInput,
  type CommandMap,
  type CommandSpec,
} from "./command-bus.ts";
export {
  EventBus,
  type EventListener,
  type EventMap,
  type ListenerErrorHandler,
} from "./event-bus.ts";
export { UntrustedText } from "./listed-tool-rules.ts";
export { type OpenWorkspaceOptions, openWorkspace, workspaceFilesKey } from "./open-workspace.ts";
export { refusalStatusLine } from "./refusal-status.ts";
export { lastTickKey, routineRunId } from "./routine-ids.ts";
export {
  type DueFunction,
  type DueRun,
  type RoutineFailure,
  RoutineScheduler,
  type RoutineSchedulerOptions,
  type RoutineStart,
  type RoutineTickResult,
} from "./routine-scheduler.ts";
export {
  type Disposable,
  ServiceError,
  type ServiceKey,
  ServiceRegistry,
  serviceKey,
} from "./service-registry.ts";
export { checkToolCall, type ToolCallCheck } from "./tool-call-check.ts";
export { toolForModel, toolResultForModel } from "./tool-for-model.ts";
export {
  type OfferedDeclaredTool,
  type OfferedListedTool,
  type OfferedTool,
  readToolListing,
  type ToolListing,
  type ToolListingInput,
  type ToolRefusal,
} from "./tool-listing.ts";
export { UndoHistory, undoLimit } from "./undo-history.ts";
export { fenceEnd, fenceStart, fenceUntrusted } from "./untrusted-fence.ts";
export { type ChangeOptions, type PendingChanges, WorkspaceFiles } from "./workspace-files.ts";
export {
  type AppCommands,
  type AppEvents,
  WorkspaceScope,
  type WorkspaceScopeOptions,
} from "./workspace-scope.ts";
