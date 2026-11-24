// The public API of @halonicjs/format/snapshot: reading and writing a
// workspace snapshot, for a runtime that serves one, such as a plugin. It
// doesn't read YAML; building a snapshot from tool files is `.`'s
// `buildSnapshot`.

export { readSnapshot, snapshotJson } from "./read.ts";
export {
  type KnownActions,
  SNAPSHOT_FORMAT,
  type SnapshotProblem,
  SnapshotTool,
  WorkspaceSnapshot,
} from "./schema.ts";
