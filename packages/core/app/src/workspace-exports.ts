// The workspace part of the public API of @halonicjs/app, re-exported by
// `index.ts` to keep that file under the size limit.
export {
  type OpenWorkspaceOptions,
  openWorkspace,
  reviewServiceKey,
  workspaceFilesKey,
} from "./open-workspace.ts";
// biome-ignore lint/performance/noReExportAll: keeps the barrel under the file-size limit; the names are listed in that file
export * from "./workspace-compare.ts";
export {
  ChangedOnDiskError,
  type ChangeOptions,
  type HeldFile,
  type PendingChanges,
  WorkspaceFiles,
} from "./workspace-files.ts";
export {
  placedRoutines,
  startOfDueRun,
  type WorkspaceRoutineSchedulerOptions,
  workspaceRoutineScheduler,
} from "./workspace-routines.ts";
export {
  type AppCommands,
  type AppEvents,
  WorkspaceScope,
  type WorkspaceScopeOptions,
} from "./workspace-scope.ts";
