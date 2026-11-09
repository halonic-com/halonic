// The public API of @halonicjs/workspace. Internal code imports by relative path.

export {
  gitIgnoreLines,
  gitIgnorePath,
  type InitializedWorkspace,
  type InitWorkspaceError,
  type InitWorkspaceFile,
  type InitWorkspaceOptions,
  initWorkspace,
  settingsPath,
} from "./init-workspace.ts";
export {
  filesOf,
  type LoadedFile,
  type LoadedFileOf,
  type LoadedWorkspace,
  loadWorkspace,
  type WorkspaceIssue,
} from "./load-workspace.ts";
export { type PlaceMatch, placeOf } from "./places.ts";
export { type ChangedConnector, type TrustChanges, trustChanges } from "./trust-changes.ts";
export {
  type ConnectorTrustContent,
  secretReference,
  type TrustContent,
  type TrustContentInput,
  trustContent,
} from "./trust-content.ts";
export { trustFingerprint, trustFingerprintPrefix } from "./trust-fingerprint.ts";
export { trustUrl } from "./trust-url.ts";
