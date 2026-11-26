import { type Infer, s } from "@halonicjs/schema-kit";
import { headerSchema } from "./header.ts";

/** A SHA-256 digest written as `sha256:` and 64 lower-case hex digits. */
const hashSchema = s.string().regex(/^sha256:[0-9a-f]{64}$/, "must be sha256: and 64 hex digits");

/** The longest compiled script, in characters: a source file is at most 300 lines (P6). */
export const maxArtifactCodeLength = 200_000;

/**
 * What `halonic toolscript build` writes and a host runs (HAL-17560, 1.4): the
 * header, the stripped JavaScript (empty for a declarative ToolScript), the
 * hash of the TypeScript source, the hash of that code, and the version of the
 * profile that checked it. A host refuses an artifact whose `codeHash` doesn't
 * match its code; hashing is the host's job, since core has no hash code.
 */
export const artifactSchema = s
  .object({
    header: headerSchema,
    code: s.string().max(maxArtifactCodeLength),
    sourceHash: hashSchema,
    codeHash: hashSchema,
    profileVersion: s.number().int().min(1),
  })
  .strict();

/** A built ToolScript artifact. */
export type Artifact = Infer<typeof artifactSchema>;
