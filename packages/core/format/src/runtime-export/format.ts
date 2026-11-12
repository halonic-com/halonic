import { isRunId } from "@halonicjs/ports";
import { type Infer, s } from "@halonicjs/schema-kit";
import { deploymentId } from "../shared/fields.ts";

/**
 * The runtime export: one deployment's runtime data in a folder, the format
 * of `halonic deploy export` and `import` (multi-cloud ADR, rule 3 and 5.6).
 *
 * The folder holds the manifest, `halonic-export.json`, and the files it
 * lists, in the layout `halonic serve` will keep in the profile:
 *
 * - `runs/<run id>.jsonl`: a run's event log, one event per line. Inbox
 *   items are run events, so they travel with their runs.
 * - `records/<SHA-256 of the collection name in UTF-16LE>.jsonl`: a
 *   collection's log of record changes, agent memory included.
 * - `blobs/<first two hex characters>/<SHA-256>`: the bytes of a file or a
 *   large payload, named by their hash.
 *
 * Nothing else has a place. The stores of secrets, sign-in tokens, sessions,
 * harness sign-ins and encryption keys aren't runtime data in this sense, and
 * the schema refuses any key or path it doesn't list, so an export can't carry
 * those stores (no-secrets rule). It can't see inside a file, so a secret a
 * run handled can still be in its log: the export step scans the contents
 * (HAL-7193). Tool approvals, trust and settings are left out on purpose, and
 * so are run snapshots and run lists, which an import rebuilds from the logs.
 *
 * Runs are kept per deployment, but records and blobs are kept per workspace,
 * and `halonic serve` isn't built yet, so the export step decides which
 * records and blobs an export carries.
 *
 * It imports only schema-kit and ports, never `yaml`, so a Worker that
 * writes an export doesn't bundle the YAML parser.
 */

/** Raised when the folder layout or a field changes in a way old readers can't handle. */
export const RUNTIME_EXPORT_FORMAT_VERSION = 1;

/** The manifest's name, at the top of the export folder. */
export const RUNTIME_EXPORT_MANIFEST = "halonic-export.json";

const sha256Hex = /^[0-9a-f]{64}$/;

/**
 * The paths a file may have. The pattern has no back-references, so readers
 * in other languages can use the JSON Schema as it is. What it can't say is
 * checked after it: a run id's own rule, which also refuses names Windows
 * keeps for devices, and that a blob's path is made of its hash.
 */
const exportPath =
  /^(?:runs\/[A-Za-z0-9_-][A-Za-z0-9_.-]{0,127}\.jsonl|records\/[0-9a-f]{64}\.jsonl|blobs\/[0-9a-f]{2}\/[0-9a-f]{64})$/;

const pathRule =
  "use runs/<run id>.jsonl, records/<sha-256>.jsonl or blobs/<first two characters>/<sha-256>";

const utcShape = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

/** A moment in UTC, as `Date.prototype.toISOString` writes it. */
const utcTime = s
  .string()
  .regex(utcShape, "use a UTC time such as 2026-11-12T06:00:00.000Z")
  .refine(
    (time) => !utcShape.test(time) || isRealTime(time),
    "use a date and time that exist, such as 2026-11-12T06:00:00.000Z",
  );

const exportFile = s
  .object({
    /** Relative to the export folder, with `/` between its parts. */
    path: s
      .string()
      .regex(exportPath, pathRule)
      .refine((path) => !isRunPath(path) || isRunId(runIdOf(path)), pathRule),
    /** The file's size in bytes. */
    bytes: s.number().int().min(0),
    /** The SHA-256 of the file's bytes, in lowercase hex. */
    sha256: s.string().regex(sha256Hex, "use a SHA-256 in lowercase hex"),
  })
  .strict();

/** The manifest, `halonic-export.json`. */
export const runtimeExportManifestSchema = s
  .object({
    formatVersion: s.literal(RUNTIME_EXPORT_FORMAT_VERSION, { error: formatVersionProblem }),
    /** The deployment the data was exported from. */
    deployment: deploymentId,
    exportedAt: utcTime,
    /** Every file in the folder but the manifest, each once, in order of path. */
    files: s.array(exportFile),
  })
  .strict()
  .superRefine((manifest, context) => {
    const seen = new Set<string>();
    let previous: string | undefined;
    manifest.files.forEach((file, index) => {
      // In order, two exports of the same data list their files the same way. A path refused already isn't refused twice.
      if (exportPath.test(file.path)) {
        if (previous !== undefined && file.path < previous) {
          context.addIssue({
            code: "custom",
            path: ["files", index, "path"],
            message: "List the files in order of their path",
          });
        }
        previous = file.path;
      }
      // Run ids may hold capitals, and macOS and Windows open `R1` and `r1` as one file.
      const opened = file.path.toLowerCase();
      if (seen.has(opened)) {
        context.addIssue({
          code: "custom",
          path: ["files", index, "path"],
          message: "Another file has this path",
        });
      }
      seen.add(opened);
      if (file.path.startsWith("blobs/") && file.path !== blobPath(file.sha256)) {
        context.addIssue({
          code: "custom",
          path: ["files", index, "sha256"],
          message: "A blob's path must be blobs/<first two characters>/<SHA-256 of its bytes>",
        });
      }
    });
  });

/** A runtime export's manifest. */
export type RuntimeExportManifest = Infer<typeof runtimeExportManifestSchema>;

/** Whether a time of the right shape names a moment that exists, so month 13 or 30 February don't pass. */
function isRealTime(time: string): boolean {
  const moment = new Date(time);
  if (Number.isNaN(moment.getTime())) {
    return false;
  }
  const written = moment.toISOString();
  return time.length === written.length
    ? time === written
    : `${time.slice(0, -1)}.000Z` === written;
}

/** The path of the blob with this hash, in the layout `halonic serve` keeps its blobs in. */
function blobPath(sha256: string): string {
  return `blobs/${sha256.slice(0, 2)}/${sha256}`;
}

/** Whether a path passed the pattern as a run's log, so a path refused already isn't refused twice. */
function isRunPath(path: string): boolean {
  return exportPath.test(path) && path.startsWith("runs/");
}

/** The run id in a `runs/<run id>.jsonl` path. */
function runIdOf(path: string): string {
  return path.slice("runs/".length, -".jsonl".length);
}

/** Says that a newer format needs a newer Halonic, rather than only "invalid value". */
function formatVersionProblem(issue: { readonly input?: unknown }): string | undefined {
  const isNewer = typeof issue.input === "number" && issue.input > RUNTIME_EXPORT_FORMAT_VERSION;
  return isNewer
    ? `This export is in format ${issue.input}, and this Halonic reads format ${RUNTIME_EXPORT_FORMAT_VERSION}. Update Halonic to import it.`
    : undefined;
}
