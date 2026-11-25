// The release file sits next to the archive and says what it is: the plugin
// id, version, archive name, sha-256, the workspace commit it was built from,
// the Halonic version that built it and what changed since the last build.
// A later build reads it back (`--since`), so parsing treats it as untrusted.

import { type Issue, parse, s } from "@halonicjs/schema-kit";
import { canonicalJson, err, ok, type Result, readVersion } from "@halonicjs/std";
import { type ChangeList, maxRoutingChanges } from "./change-list.ts";
import { archiveFileName, pluginIdPattern } from "./plugin-id.ts";
import { pluginVersionPattern } from "./plugin-version.ts";
import { maxToolNameLength } from "./snapshot.ts";

/** The largest release file a build reads back. Ours are well under 1 KiB plus the change list. */
export const maxReleaseFileBytes = 256 * 1024;

/** A tool name in the change list, as long as the snapshot allows. */
const toolName = s.string().min(1).max(maxToolNameLength);

/**
 * A routing entry in the change list: `roles.<role>` or `areas.<area>`, never
 * free text. Roles and areas are slugs, as the format's `AREA_NAME_PATTERN`.
 */
const routingEntry = s.string().regex(/^(?:roles|areas)\.[a-z][a-z0-9-]{0,63}$/);

const releaseFileSchema = s
  .object({
    pluginId: s.string().regex(pluginIdPattern),
    version: s.string().regex(pluginVersionPattern),
    archive: s.string(),
    sha256: s.string().regex(/^[0-9a-f]{64}$/),
    // A SHA-1 commit, or a SHA-256 one in a repository that uses them.
    workspaceCommit: s.string().regex(/^[0-9a-f]{40}(?:[0-9a-f]{24})?$/),
    halonicVersion: s
      .string()
      .max(64)
      .refine((text) => readVersion(text) !== undefined, "Not a version"),
    changes: s
      .object({
        added: s.array(toolName),
        removed: s.array(toolName),
        changed: s.array(
          s.object({ tool: toolName, fields: s.array(s.string().max(maxToolNameLength)) }).strict(),
        ),
        routing: s.array(routingEntry).max(maxRoutingChanges).optional(),
      })
      .strict(),
  })
  .strict()
  // The archive's name is never free text: it must be the one its id and version give.
  .refine((file) => file.archive === archiveFileName(file.pluginId, file.version), {
    message: "The archive name doesn't match the plugin id and version",
    path: ["archive"],
  });

/** What a release file says about one build. */
export interface ReleaseFile {
  /** The plugin id, such as `halonic-ws.acme`. */
  readonly pluginId: string;
  /** The plugin's version, strict `x.y.z`. */
  readonly version: string;
  /** The archive's file name, next to the release file. */
  readonly archive: string;
  /** The archive's sha-256, 64 lowercase hex characters. */
  readonly sha256: string;
  /** The workspace commit the build was made from. */
  readonly workspaceCommit: string;
  /** The version of Halonic that made the build. */
  readonly halonicVersion: string;
  /** What changed since the previous build. */
  readonly changes: ChangeList;
}

/** What goes into a new release file; the archive name follows from the id and version. */
export type ReleaseFileFields = Omit<ReleaseFile, "archive">;

/** Why a release file was refused. */
export type ReleaseFileProblem =
  | { readonly code: "too-large"; readonly maxBytes: number }
  | { readonly code: "not-json" }
  | { readonly code: "invalid"; readonly issues: readonly Issue[] };

/**
 * Writes a release file: canonical JSON (keys sorted) and a line break at
 * the end, so the same build always gives the same file.
 *
 * @throws {TypeError} when a field isn't what {@link parseReleaseFile} would accept
 */
export function releaseFileText(fields: ReleaseFileFields): string {
  const file = { ...fields, archive: archiveFileName(fields.pluginId, fields.version) };
  const checked = parse(releaseFileSchema, file);
  if (!checked.ok) {
    const paths = checked.error.map((issue) => issue.path.join(".")).join(", ");
    throw new TypeError(`Can't write a release file with these fields: ${paths}.`);
  }
  return `${canonicalJson(file)}\n`;
}

/**
 * Reads a release file, which is untrusted: it refuses a file over
 * {@link maxReleaseFileBytes}, anything that isn't JSON, unknown fields, and
 * an id, version, archive name, sha-256 or commit that isn't in its strict form.
 *
 * @param text - the release file's text
 * @returns the release file, or why it was refused
 */
export function parseReleaseFile(text: string): Result<ReleaseFile, ReleaseFileProblem> {
  // Each UTF-16 unit is at most 3 UTF-8 bytes; the length check keeps JSON.parse bounded.
  if (text.length > maxReleaseFileBytes) {
    return err({ code: "too-large", maxBytes: maxReleaseFileBytes });
  }
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    // The parser's message can quote the input; the code is all a caller needs.
    return err({ code: "not-json" });
  }
  const checked = parse(releaseFileSchema, data);
  if (!checked.ok) {
    return err({ code: "invalid", issues: checked.error });
  }
  return ok(checked.value);
}
