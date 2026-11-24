// The workspace snapshot (plan HAL-17450 rev 5, "How the plugin reads the
// workspace"): one checked list of what a workspace commit offers its agents.
// The builder writes it into the plugin, and the plugin's loader reads it
// again before using it. It is plain data with nothing engine- or
// Paperclip-specific in it, so the server engine can serve the same file.
// Signals, templates and routing join it later, each as a new optional list.
import {
  type Infer,
  JSON_SCHEMA_DRAFT,
  type JsonSchema,
  s,
  toJsonSchema,
} from "@halonicjs/schema-kit";
import { SPEC_ID_BASE } from "../json-schema.ts";
import { Tool } from "../kinds/tool/schema.ts";
import { label } from "../shared/shown-text.ts";

/** The snapshot format this version of Halonic writes and reads. */
export const SNAPSHOT_FORMAT = 1 as const;

/** The most tools one snapshot holds. */
export const MAX_SNAPSHOT_TOOLS = 200;

/** A git commit id: 40 hex digits (SHA-1) or 64 (SHA-256), lowercase. */
const commit = s
  .string()
  .regex(/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/, "use the full commit id in lowercase hex");

/** A workspace snapshot, as the builder writes it and the plugin reads it. */
export const WorkspaceSnapshot = s
  .object({
    format: s.literal(SNAPSHOT_FORMAT, { error: `format must be ${SNAPSHOT_FORMAT}` }),
    /** Which workspace and commit it was made from. */
    workspace: s.object({ name: label, commit }).strict(),
    /** The tools, sorted by name, each name once. */
    tools: s.array(Tool).max(MAX_SNAPSHOT_TOOLS),
  })
  .strict();

/** A workspace snapshot. */
export type WorkspaceSnapshot = Infer<typeof WorkspaceSnapshot>;

/**
 * The snapshot's JSON Schema (2020-12), for other engines and for anyone
 * who checks a snapshot without Halonic. Checks over several tools (names
 * used twice, the order) can't be expressed and are left out.
 *
 * @example
 * snapshotJsonSchema()["$id"]; // "https://halonic.com/spec/format/workspace-snapshot/v1.schema.json"
 */
export function snapshotJsonSchema(): JsonSchema {
  return {
    $schema: JSON_SCHEMA_DRAFT,
    $id: `${SPEC_ID_BASE}/workspace-snapshot/v${SNAPSHOT_FORMAT}.schema.json`,
    ...toJsonSchema(WorkspaceSnapshot),
  };
}
