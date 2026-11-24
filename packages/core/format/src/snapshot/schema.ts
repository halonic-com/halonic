import { type Infer, type Path, s } from "@halonicjs/schema-kit";
import { toolFields } from "../kinds/tool/schema.ts";

/*
 * The snapshot: everything a workspace commit defines for an engine to
 * serve, checked and in one file. It is plain data with nothing
 * engine-specific in it, so a Paperclip plugin and the server engine can
 * read the same file. It holds tools for now; signals, templates and
 * routing come later as new top-level lists under a new `snapshot` number.
 */

/** The snapshot format this version of Halonic writes and reads. */
export const SNAPSHOT_FORMAT = 1 as const;

/** A git commit id: 40 hex digits (SHA-1), or 64 (SHA-256). */
const COMMIT_PATTERN = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;

/** A tool as the snapshot keeps it: the file's fields without `version`. */
export const SnapshotTool = s.object(toolFields).strict();

/** A workspace snapshot. */
export const WorkspaceSnapshot = s
  .object({
    snapshot: s.literal(SNAPSHOT_FORMAT, { error: `snapshot must be ${SNAPSHOT_FORMAT}` }),
    /** The workspace commit the snapshot was built from. */
    commit: s.string().regex(COMMIT_PATTERN, "use the full commit id in lowercase hex"),
    /** The tools, sorted by name. */
    tools: s.array(SnapshotTool).max(500),
  })
  .strict();

/** A workspace snapshot, as read or built. */
export type WorkspaceSnapshot = Infer<typeof WorkspaceSnapshot>;

/** Something that keeps a snapshot, or a tool file, out. */
export interface SnapshotProblem {
  /** A stable name for the rule, such as `tool-action-unknown`. */
  readonly code: string;
  /** The tool file it is in, when building; absent when reading a snapshot. */
  readonly file?: string;
  /** Where in the file or the snapshot. */
  readonly path: Path;
  readonly message: string;
}

/**
 * The actions this version of Halonic can run, by name. The runtime that
 * serves the snapshot gives them, so a tool can only use an action that
 * exists in the code that will run it.
 */
export type KnownActions = ReadonlySet<string>;
