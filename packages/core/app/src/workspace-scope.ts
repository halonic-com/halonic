import { CommandBus, type CommandMap } from "./command-bus.ts";
import { EventBus, type EventMap } from "./event-bus.ts";
import { ServiceRegistry } from "./service-registry.ts";

/**
 * The commands of an open workspace. Each feature adds its own with
 * declaration merging, so command names and payloads are checked everywhere:
 *
 * @example
 * declare module "@halonicjs/app" {
 *   interface AppCommands {
 *     "agents.create": CommandSpec<{ name: string }, string>;
 *   }
 * }
 */
// biome-ignore lint/suspicious/noEmptyInterface: features extend it with declaration merging.
export interface AppCommands {}

/** The events of an open workspace. Features add their own as for {@link AppCommands}. */
export interface AppEvents {
  /** The workspace is closing: its services are disposed next. Sent once. */
  "workspace.closing": { location: string };
}

/**
 * Everything that belongs to one open workspace: its commands, events and
 * services. One window can hold several workspaces, so nothing here is
 * global (plan 4.2, U1). Device-wide settings such as the theme live outside
 * any scope and outlive it.
 */
export class WorkspaceScope<
  Commands extends CommandMap<Commands> = AppCommands,
  Events extends EventMap<Events> & AppEvents = AppEvents,
> {
  readonly commands = new CommandBus<Commands>();
  readonly events = new EventBus<Events>();
  readonly services = new ServiceRegistry();
  private closing: Promise<void> | null = null;

  /** Where the workspace lives, as its `DefinitionStore` reports it. */
  readonly location: string;

  /**
   * @param location - where the workspace lives, as its `DefinitionStore` reports it
   */
  constructor(location: string) {
    this.location = location;
  }

  /** Whether {@link close} has been called. */
  get closed(): boolean {
    return this.closing !== null;
  }

  /**
   * Closes the workspace: sends `workspace.closing`, disposes the services
   * newest first, then drops every command handler and event listener.
   * Closing again returns the same promise.
   *
   * @throws when a listener or a service's `dispose` failed; the scope is closed anyway
   */
  close(): Promise<void> {
    this.closing ??= this.closeOnce();
    return this.closing;
  }

  private async closeOnce(): Promise<void> {
    try {
      this.events.emit("workspace.closing", {
        location: this.location,
      } as Events["workspace.closing"]);
    } finally {
      try {
        await this.services.dispose();
      } finally {
        this.commands.clear();
        this.events.clear();
      }
    }
  }
}
