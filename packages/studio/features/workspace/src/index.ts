export { workspaceFeature } from "./feature.ts";
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
