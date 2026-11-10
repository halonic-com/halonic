import type { DefinitionStore, Digest } from "@halonicjs/ports";
import type { ListenerErrorHandler } from "./event-bus.ts";
import { ReviewService } from "./review-service.ts";
import { serviceKey } from "./service-registry.ts";
import { WorkspaceFiles } from "./workspace-files.ts";
import { WorkspaceScope, type WorkspaceScopeOptions } from "./workspace-scope.ts";

/** The files of the open workspace, with their unsaved changes and undo. */
export const workspaceFilesKey = serviceKey<WorkspaceFiles>("workspace.files");

/** The assistant's changes to review in the open workspace. */
export const reviewServiceKey = serviceKey<ReviewService>("workspace.review");

/** What {@link openWorkspace} needs. */
export interface OpenWorkspaceOptions {
  /** Where the workspace files live. */
  store: DefinitionStore;
  /**
   * The store for the review records: rooted at the workspace's review
   * folder in the profile (`reviewFolder()` of `workspaceFolders`), never
   * in the workspace (HAL-3417).
   */
  reviewRecords: DefinitionStore;
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
 * const folders = await workspaceFolders(profile, workspaceRealPath, digest);
 * const scope = openWorkspace({
 *   store,
 *   reviewRecords: new FolderDefinitionStore(folders.reviewFolder()),
 *   digest,
 *   onListenerError: (error) => log.error(error),
 * });
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
  scope.services.provide(
    reviewServiceKey,
    new ReviewService({
      store: options.store,
      records: options.reviewRecords,
      digest: options.digest,
      onListenerError: options.onListenerError,
    }),
  );
  scope.commands.register("workspace.save", () => files.save());
  scope.commands.register("workspace.undo", () => files.undo());
  scope.commands.register("workspace.redo", () => files.redo());
  return scope;
}
