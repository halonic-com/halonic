// Field schemas that several file kinds share. Each keeps the exact rule and
// message of the old schema (784f78d: packages/core/schema/src/index.ts).
import { s } from "@halonicjs/schema-kit";

/** The file format version every kind's `version` key holds. */
export const SCHEMA_VERSION = 1 as const;

/** An item's id: lowercase letters, digits, `-` and `_`, starting with a letter or digit. */
export const id = s
  .string()
  .min(1)
  .regex(/^[a-z0-9][a-z0-9-_]*$/, "use lowercase letters, digits, '-' or '_'");

/**
 * The most characters an id that names a folder may have. A deployment's runs
 * live in `deployments/<id>/runs` and an agent's harness settings in
 * `harness-settings/<id>/<harness>` in the profile, and 64 keeps those paths
 * well under Windows' 260-character limit.
 */
const FOLDER_ID_MAX_LENGTH = 64;

/** Names Windows keeps for devices, as pattern alternatives; no file or folder can have them. */
const WINDOWS_DEVICE_NAMES = "con|prn|aux|nul|com[0-9]|lpt[0-9]";

/**
 * An {@link id} that names a folder in the profile: at most 64 characters
 * and not a Windows device name. `owner` says whose folder it is in the
 * message. The device names are refused through a pattern, not a
 * refinement, so the JSON Schema carries the rule too. `@halonicjs/profile`
 * keeps the same rule, and a test in each kind that uses it holds the two
 * together.
 */
function folderId(owner: string) {
  return id
    .max(
      FOLDER_ID_MAX_LENGTH,
      `use at most ${FOLDER_ID_MAX_LENGTH} characters, so the ${owner}'s folder fits in a Windows path`,
    )
    .regex(
      new RegExp(`^(?!(?:${WINDOWS_DEVICE_NAMES})$)`),
      "use a name Windows doesn't keep for a device (con, prn, aux, nul, com0-com9, lpt0-lpt9)",
    );
}

/** A deployment's id, which names the deployment's runs folder. */
export const deploymentId = folderId("deployment");

/** An agent's id, which names the agent's harness settings folder. */
export const agentId = folderId("agent");

/**
 * A workspace collection's id: lowercase letters, digits and `-`, starting
 * with a letter or digit. Halonic's own collections (`_tokens`,
 * `_google_setups`) start with `_`, so no workspace file can name them.
 * The scheduler's and coordination's collections (`halonic.scheduler.timers`,
 * `halonic.coordination`) are kept out by the `.` instead, so keep a `.` in
 * their names.
 */
export const collectionId = s
  .string()
  .regex(/^[a-z0-9][a-z0-9-]*$/, "use lowercase letters, digits or '-'");

/** The `version` key: `1`, and `1` when the file leaves it out. */
export const version = s.literal(SCHEMA_VERSION).default(SCHEMA_VERSION);

/** A whole number and a unit: minutes, hours or days ("30m", "4h", "2d"). */
export const DURATION_PATTERN = /^[1-9]\d*(m|h|d)$/;

/** Tuning passed to a model (temperature, maxTokens, …). */
export const ModelParams = s
  .object({
    temperature: s.number().min(0).max(2).optional(),
    topP: s.number().min(0).max(1).optional(),
    maxTokens: s.number().int().positive().optional(),
    stop: s.array(s.string()).optional(),
    reasoningEffort: s.enum(["low", "medium", "high"]).optional(),
    /** Provider-specific extras, passed through untouched. */
    extra: s.record(s.string(), s.unknown()).optional(),
  })
  .strict();
