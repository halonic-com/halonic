export { workspaceFeature } from "./feature.ts";
export {
  type CreatedTrust,
  type FolderState,
  NewWorkspaceDialog,
  type NewWorkspaceDialogProps,
  type NewWorkspaceHost,
  NewWorkspaceRefusal,
} from "./new-workspace/new-workspace-dialog.tsx";
export { createdLine, NEW_WORKSPACE_MENU_ROW } from "./new-workspace/new-workspace-text.ts";
export {
  type MountedWorkspaceWindow,
  mountWorkspaceWindow,
} from "./switcher/mount-workspace-window.tsx";
export { type OpenSlot, OpenWorkspaces } from "./switcher/open-workspaces.ts";
export {
  RECENT_WORKSPACES,
  type RecentStorage,
  RecentWorkspaces,
  type RememberedWorkspace,
} from "./switcher/recent-workspaces.ts";
export { type WorkspaceMenuOptions, workspaceMenu } from "./switcher/workspace-menu.ts";
export {
  AUTOSAVE_DELAY_MS,
  historyKey,
  type SavableFiles,
  WorkspaceSaving,
  type WorkspaceSavingOptions,
} from "./switcher/workspace-saving.ts";
export {
  type CloseRequest,
  folderName,
  type OpenedWorkspace,
  WorkspaceSwitcher,
  type WorkspaceSwitcherOptions,
} from "./switcher/workspace-switcher.ts";
export {
  WorkspaceWindow,
  type WorkspaceWindowProps,
  workspaceKeyPosition,
} from "./switcher/workspace-window.tsx";
export type {
  TrustGrantResult,
  TrustReview,
  TrustRowView,
  TrustSectionView,
  WorkspaceTrustControl,
} from "./trust/workspace-trust-control.ts";
export {
  WorkspaceTrustSection,
  type WorkspaceTrustSectionProps,
} from "./trust/workspace-trust-section.tsx";
