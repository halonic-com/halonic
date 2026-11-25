// The workspace snapshot (plan HAL-17450 rev 5, "How the plugin reads the
// workspace"): one checked list of what a workspace commit offers its agents.
// The builder writes it into the plugin, and the plugin's loader reads it
// again before using it. It is plain data with nothing engine- or
// Paperclip-specific in it, so the server engine can serve the same file.
// Templates (HAL-18141), routing (HAL-17982) and signals (HAL-17980) are
// optional parts, so a snapshot without them stays as it was.
import {
  type Infer,
  JSON_SCHEMA_DRAFT,
  type JsonSchema,
  s,
  toJsonSchema,
} from "@halonicjs/schema-kit";
import { SPEC_ID_BASE } from "../json-schema.ts";
import { Signal } from "../kinds/signal/schema.ts";
import { Template } from "../kinds/template/schema.ts";
import { Tool } from "../kinds/tool/schema.ts";
import { label } from "../shared/shown-text.ts";
import { Routing } from "./routing.ts";

/** The snapshot format this version of Halonic writes and reads. */
export const SNAPSHOT_FORMAT = 1 as const;

/** The most tools one snapshot holds. */
export const MAX_SNAPSHOT_TOOLS = 200;

/** The most templates one snapshot holds. */
export const MAX_SNAPSHOT_TEMPLATES = 100;

/** The most signals one snapshot holds. */
export const MAX_SNAPSHOT_SIGNALS = 50;

/** The most bytes a snapshot's text may have; a larger one is refused before it is parsed. */
export const MAX_SNAPSHOT_BYTES = 4 * 1024 * 1024;

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
    /** The templates agents can read, sorted by id, each id once. Left out when there are none. */
    templates: s.array(Template.strict()).max(MAX_SNAPSHOT_TEMPLATES).optional(),
    /** Who covers each role and owns each area; without it, each reader keeps its own defaults. */
    routing: Routing.optional(),
    /** The signals, sorted by id, each id and rule once. Left out when there are none. */
    signals: s.array(Signal).max(MAX_SNAPSHOT_SIGNALS).optional(),
  })
  .strict();

/** A workspace snapshot. */
export type WorkspaceSnapshot = Infer<typeof WorkspaceSnapshot>;

/**
 * The snapshot's JSON Schema (2020-12), for other engines and for anyone
 * who checks a snapshot without Halonic. Checks over several tools,
 * templates or signals (names or ids used twice, the order) can't be
 * expressed and are left out.
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
