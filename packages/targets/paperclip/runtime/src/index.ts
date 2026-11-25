/**
 * Public entry point of the Paperclip plugin runtime: what a plugin built from
 * a workspace runs inside Paperclip. The action list for the builder is the
 * separate `./actions` entry; the plugin worker that runs it inside Paperclip comes in a later step (see README.md).
 */

export {
  type ActiveSnapshot,
  activeSnapshot,
  type RuntimeApi,
  retryAfterMs,
} from "./active-snapshot.ts";
export { builtInSnapshot, emptySnapshot, type ReadJson } from "./built-in.ts";
export { type CheckState, checkState, type GitHubGet, gitHubReader } from "./github.ts";
export {
  type ActionCall,
  type ActionHandler,
  type ActionHandlers,
  runtimeHandlers,
} from "./handlers.ts";
export type {
  Capability,
  RuntimeHost,
  SecretRef,
  StateKey,
  ToolDeclaration,
  ToolResult,
  ToolRunContext,
} from "./host.ts";
export {
  defaultSnapshotRef,
  defaultWorkspaceCheck,
  isRepoName,
  readPin,
  workspacePinProperties,
} from "./pin.ts";
export {
  checkedSnapshot,
  fetchPinnedSnapshot,
  type SnapshotPin,
  sha256Hex,
  snapshotPath,
} from "./pinned-snapshot.ts";
export { precheckSettingProperties } from "./precheck/precheck-origin.ts";
export {
  callTimeoutMs,
  type RuntimeSetup,
  registerWorkspaceTools,
  requestTimeoutMs,
  type WorkspaceRuntimeApi,
} from "./register.ts";
