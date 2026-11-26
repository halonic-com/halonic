import type { Digest } from "@halonicjs/ports";
import { formatPath, parse } from "@halonicjs/schema-kit";
import { bytesToHex, encodeUtf8 } from "@halonicjs/std";
import { type Artifact, artifactSchema, maxArtifactCodeLength } from "@halonicjs/toolscript";
import { type CheckOptions, checkToolScript } from "./check.ts";
import { messages, type Problem } from "./messages.ts";
import { normalizeSource, stripTypes } from "./strip-types.ts";

/** The version of the profile this checker enforces, written into every artifact. */
export const profileVersion = 1;

/** What `buildToolScript` needs besides the source. */
export interface BuildOptions extends CheckOptions {
  /** Hashes the source and the code; the adapter has no hash code of its own. */
  readonly digest: Digest;
}

/** The artifact, or every problem that stopped the build. */
export type BuildResult =
  | { readonly ok: true; readonly artifact: Artifact }
  | { readonly ok: false; readonly problems: Problem[] };

/** `sha256:` and the hex SHA-256 of the text's UTF-8 bytes. */
async function hashOf(text: string, digest: Digest): Promise<string> {
  return `sha256:${bytesToHex(await digest.sha256(encodeUtf8(text)))}`;
}

/**
 * Checks a ToolScript and builds its artifact (HAL-17560, 1.4): the header,
 * the stripped code (empty for a declarative script), the hashes of the
 * source and the code, and the profile version. The same source always gives
 * the same artifact, so anyone can rebuild it and compare.
 *
 * @throws when the built artifact doesn't match its schema, which would be a bug in this package
 *
 * @example
 * const built = await buildToolScript(source, { fileName: "sync.tool.ts", riskOf, digest });
 */
export async function buildToolScript(source: string, options: BuildOptions): Promise<BuildResult> {
  const checked = checkToolScript(source, options);
  if (!checked.ok) return checked;
  const text = normalizeSource(source);
  const code = checked.hasRun ? stripTypes(text, options.fileName) : "";
  if (code.length > maxArtifactCodeLength) {
    const message = messages.codeTooLong(code.length, maxArtifactCodeLength);
    return { ok: false, problems: [{ rule: "P6", message, line: 1, column: 1 }] };
  }
  const parsed = parse(artifactSchema, {
    header: checked.header,
    code,
    sourceHash: await hashOf(text, options.digest),
    codeHash: await hashOf(code, options.digest),
    profileVersion,
  });
  if (!parsed.ok) {
    // The check and the length test above cover every field, so this is a bug here.
    const where = parsed.error.map((issue) => `${formatPath(issue.path)}: ${issue.message}`);
    throw new Error(`The built artifact doesn't match its schema: ${where.join("; ")}`);
  }
  return { ok: true, artifact: parsed.value };
}

/**
 * True when an artifact's `codeHash` matches its code. A host refuses an
 * artifact that fails this (HAL-17560, 1.4).
 */
export async function verifyArtifact(artifact: Artifact, digest: Digest): Promise<boolean> {
  return (await hashOf(artifact.code, digest)) === artifact.codeHash;
}
