import type { DefinitionStore, Digest } from "@halonicjs/ports";
import type { ListenerErrorHandler } from "./event-bus.ts";
import { ReviewService } from "./review-service.ts";
import { ReviewingDefinitionStore } from "./reviewing-store.ts";
import { serviceKey } from "./service-registry.ts";
import { WorkspaceFiles } from "./workspace-files.ts";
import { WorkspaceScope, type WorkspaceScopeOptions } from "./workspace-scope.ts";

/** The files of the open workspace, with their unsaved changes and undo. */
export const workspaceFilesKey = serviceKey<WorkspaceFiles>("workspace.files");

/** The assistant's changes to review in the open workspace. */
export const reviewServiceKey = serviceKey<ReviewService>("workspace.review");

/** What {@link openWorkspace} needs. */
export interface OpenWorkspaceOptions {
  /**
   * Where the workspace files live: the real store, never a dry run. The
   * scope hides the review records from everything but the review service
   * by wrapping it in a `ReviewingDefinitionStore`, whose version would
   * hide a dry run's `dry-run:` prefix.
   */
  store: DefinitionStore;
  /** Hashes file text: the review records and the write-if-unchanged check need it. */
  digest: Digest;
  /** Receives the error of an event listener that threw; see {@link WorkspaceScopeOptions}. */
  onListenerError: ListenerErrorHandler;
}

/**
 * Opens a workspace: a new scope with the workspace files and the
 * assistant's changes to review as services, and the kernel's own commands (`workspace.save`, `workspace.undo`,
 * `workspace.redo`). Features add their services and commands to the scope
 * it returns; `close()` disposes all of them.
 *
 * @example
 * const scope = openWorkspace({ store, digest, onListenerError: (error) => log.error(error) });
 * scope.services.get(workspaceFilesKey).change("Added an agent", { "hubs/p/agents/a.agent.yaml": "name: A\n" });
 * await scope.commands.execute("workspace.save");
 */
export function openWorkspace(options: OpenWorkspaceOptions): WorkspaceScope {
  const scope = new WorkspaceScope({
    location: options.store.location,
    onListenerError: options.onListenerError,
  });
  // Everything but the review service gets the store with the review records hidden.
  const store = new ReviewingDefinitionStore(options.store, options.digest);
  const files = scope.services.provide(workspaceFilesKey, new WorkspaceFiles(store, scope.events));
  scope.services.provide(
    reviewServiceKey,
    new ReviewService({
      store: options.store,
      digest: options.digest,
      onListenerError: options.onListenerError,
    }),
  );
  scope.commands.register("workspace.save", () => files.save());
  scope.commands.register("workspace.undo", () => files.undo());
  scope.commands.register("workspace.redo", () => files.redo());
  return scope;
}
