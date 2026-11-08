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
export {
  type Disposable,
  ServiceError,
  type ServiceKey,
  ServiceRegistry,
  serviceKey,
} from "./service-registry.ts";
export {
  type AppCommands,
  type AppEvents,
  WorkspaceScope,
  type WorkspaceScopeOptions,
} from "./workspace-scope.ts";
