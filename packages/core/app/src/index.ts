// The public API of @halonicjs/app. Everything else in src/ is internal.
export {
  CommandBus,
  CommandError,
  type CommandHandler,
  type CommandMap,
  type CommandSpec,
} from "./command-bus.ts";
export { EventBus, type EventListener, type EventMap } from "./event-bus.ts";
export {
  type Disposable,
  ServiceError,
  type ServiceKey,
  ServiceRegistry,
  serviceKey,
} from "./service-registry.ts";
export { type AppCommands, type AppEvents, WorkspaceScope } from "./workspace-scope.ts";
