import { findTooDeep } from "./depth.ts";
import { fromZodIssue, type Issue } from "./issue.ts";
import { err, ok, type Result } from "./result.ts";
import type { Infer, Schema } from "./schema.ts";

/**
 * Checks an input against a schema. Never throws for a bad input: it returns
 * the parsed value, with defaults filled in, or every issue with its path.
 *
 * @param schema - the schema to check against
 * @param input - anything, usually a parsed YAML or JSON file
 * @returns `ok(value)`, or `err(issues)` with at least one issue
 *
 * @example
 * const parsed = parse(Deployment, { name: "prod" });
 * if (!parsed.ok) return reportAt(parsed.error[0].path);
 * deploy(parsed.value);
 */
export function parse<S extends Schema>(schema: S, input: unknown): Result<Infer<S>, Issue[]> {
  const tooDeep = findTooDeep(input);
  if (tooDeep !== undefined) return err([tooDeep]);
  const result = schema.safeParse(input);
  if (result.success) return ok(result.data);
  return err(result.error.issues.map(fromZodIssue));
}
