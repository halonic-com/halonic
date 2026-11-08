import { CommandBus, type CommandMap, type CommandSpec } from "./command-bus.ts";
import { EventBus, type EventMap, type ListenerErrorHandler } from "./event-bus.ts";
import type { RoutineTickResult } from "./routine-scheduler.ts";
import { ServiceRegistry } from "./service-registry.ts";
import type { PendingChanges } from "./workspace-files.ts";

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
export interface AppCommands {
  /** Writes every unsaved change; answers how many files were written or deleted. */
  "workspace.save": CommandSpec<void, number>;
  /** Steps back through the workspace-wide undo; `false` when there was nothing to undo. */
  "workspace.undo": CommandSpec<void, boolean>;
  /** Steps forward again; `false` when there was nothing to redo. */
  "workspace.redo": CommandSpec<void, boolean>;
}

/** The events of an open workspace. Features add their own as for {@link AppCommands}. */
export interface AppEvents {
  /** The workspace is closing: its services are disposed next. Sent once. */
  "workspace.closing": { location: string };
  /** The unsaved changes changed: an edit, undo, redo, save or discard. */
  "files.changed": { pending: PendingChanges; label: string };
  /** Files were written to or deleted from the store. */
  "files.saved": { paths: string[] };
  /** A routine tick asked what is due, at this ISO time, and started what it could. */
  "routines.ticked": RoutineTickResult & { at: string };
}

/** What a {@link WorkspaceScope} needs. */
export interface WorkspaceScopeOptions {
  /** Where the workspace lives, as its `DefinitionStore` reports it. */
  location: string;
  /**
   * Receives the error of an event listener that threw, such as a faulty
   * feature listening to `files.changed`. The host reports it (a log, a
   * toast); whoever sent the event carries on.
   */
  onListenerError: ListenerErrorHandler;
}

/**
 * Everything that belongs to one open workspace: its commands, events and
 * services. One window can hold several workspaces, so nothing here is
 * global. Device-wide settings such as the theme live outside
 * any scope and outlive it.
 *
 * Features add their commands and events to {@link AppCommands} and
 * {@link AppEvents}; a scope with its own maps must still include the kernel's.
 */
export class WorkspaceScope<
  Commands extends CommandMap<Commands> & AppCommands = AppCommands,
  Events extends EventMap<Events> & AppEvents = AppEvents,
> {
  readonly commands = new CommandBus<Commands>();
  readonly events: EventBus<Events>;
  readonly services = new ServiceRegistry();
  private closing: Promise<void> | null = null;

  /** Where the workspace lives, as its `DefinitionStore` reports it. */
  readonly location: string;

  constructor(options: WorkspaceScopeOptions) {
    this.location = options.location;
    this.events = new EventBus<Events>(options.onListenerError);
  }

  /** Whether {@link close} has been called. */
  get closed(): boolean {
    return this.closing !== null;
  }

  /**
   * Closes the workspace: sends `workspace.closing`, disposes the services
   * newest first, then drops every command handler and event listener.
   * Closing again returns the same promise. Afterwards the scope accepts no
   * new commands or services.
   *
   * @throws when a service's `dispose` failed, or the host's `onListenerError`
   *   threw; the scope is closed and every service disposed anyway
   */
  close(): Promise<void> {
    this.closing ??= this.closeOnce();
    return this.closing;
  }

  private async closeOnce(): Promise<void> {
    const errors: unknown[] = [];
    try {
      // The bus reports listener errors instead of throwing them; it throws
      // only if the host's `onListenerError` itself throws.
      this.events.emit("workspace.closing", {
        location: this.location,
      } as Events["workspace.closing"]);
    } catch (error) {
      errors.push(error);
    }
    try {
      await this.services.dispose();
    } catch (error) {
      errors.push(error);
    } finally {
      this.commands.close();
      this.events.clear();
    }
    if (errors.length === 1) {
      throw errors[0];
    }
    if (errors.length > 1) {
      throw new AggregateError(errors, "Closing the workspace failed.");
    }
  }
}
