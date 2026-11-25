// The public API of @halonicjs/format/snapshot: reading and writing a
// workspace snapshot, for a runtime that serves one, such as a plugin. It
// doesn't read YAML; building a snapshot from tool files is `.`'s
// `buildSnapshot`.

export { readSnapshot, snapshotJson } from "./read.ts";
export {
  type KnownActions,
  MAX_SNAPSHOT_BYTES,
  MAX_TOOL_FILE_BYTES,
  SNAPSHOT_FORMAT,
  type SnapshotProblem,
  SnapshotTool,
  WorkspaceSnapshot,
} from "./schema.ts";
