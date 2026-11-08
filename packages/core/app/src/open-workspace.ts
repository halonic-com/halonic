import type { DefinitionStore } from "@halonicjs/ports";
import type { ListenerErrorHandler } from "./event-bus.ts";
import { serviceKey } from "./service-registry.ts";
import { WorkspaceFiles } from "./workspace-files.ts";
import { WorkspaceScope, type WorkspaceScopeOptions } from "./workspace-scope.ts";

/** The files of the open workspace, with their unsaved changes and undo. */
export const workspaceFilesKey = serviceKey<WorkspaceFiles>("workspace.files");

/** What {@link openWorkspace} needs. */
export interface OpenWorkspaceOptions {
  /** Where the workspace files live. */
  store: DefinitionStore;
  /** Receives the error of an event listener that threw; see {@link WorkspaceScopeOptions}. */
  onListenerError: ListenerErrorHandler;
}

/**
 * Opens a workspace: a new scope with the workspace files as a service and
 * the kernel's own commands (`workspace.save`, `workspace.undo`,
 * `workspace.redo`). Features add their services and commands to the scope
 * it returns; `close()` disposes all of them.
 *
 * @example
 * const scope = openWorkspace({ store, onListenerError: (error) => log.error(error) });
 * scope.services.get(workspaceFilesKey).change("Added an agent", { "hubs/p/agents/a.agent.yaml": "name: A\n" });
 * await scope.commands.execute("workspace.save");
 */
export function openWorkspace(options: OpenWorkspaceOptions): WorkspaceScope {
  const scope = new WorkspaceScope({
    location: options.store.location,
    onListenerError: options.onListenerError,
  });
  const files = scope.services.provide(
    workspaceFilesKey,
    new WorkspaceFiles(options.store, scope.events),
  );
  scope.commands.register("workspace.save", () => files.save());
  scope.commands.register("workspace.undo", () => files.undo());
  scope.commands.register("workspace.redo", () => files.redo());
  return scope;
}
