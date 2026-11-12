// Checks a folder id against its JSON Schema the way another engine would, so
// the folder tests can show the spec file accepts the same ids as the parser.
import type { JsonSchema } from "@halonicjs/schema-kit";

/** Lookahead or lookbehind, which Go's `regexp` and Rust's `regex` can't compile. */
const LOOKAROUND = /\(\?<?[=!]/;

/** The keywords a folder id's JSON Schema uses. */
type FolderIdSchema = {
  readonly minLength: number;
  readonly maxLength: number;
  readonly pattern: string;
  readonly not: { readonly pattern: string };
};

/**
 * Whether a folder id's JSON Schema accepts `value`. Each pattern is first
 * checked for lookaround, so a schema only Node's engine can read fails here.
 */
export function folderIdSchemaAccepts(schema: JsonSchema, value: string): boolean {
  const { minLength, maxLength, pattern, not } = schema as FolderIdSchema;
  for (const source of [pattern, not.pattern]) {
    if (LOOKAROUND.test(source)) {
      throw new Error(`pattern ${source} uses lookaround`);
    }
  }
  return (
    value.length >= minLength &&
    value.length <= maxLength &&
    new RegExp(pattern, "u").test(value) &&
    !new RegExp(not.pattern, "u").test(value)
  );
}
