import { err, ok, type Result } from "@halonicjs/std";
import type { z } from "zod";
import { findTooDeep } from "./depth.ts";
import { fromZodIssue, type Issue, knownKeysOf } from "./issue.ts";
import { plainMessage } from "./plain-words.ts";
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
  // Zod's error map is the one place that sees which object a key is unknown
  // to, and the value that was wrong. We note the keys the object allows and
  // say the common issues in plain words. A schema's own message comes first:
  // Zod only asks this map when the schema has none.
  const knownKeys = new Map<string, readonly string[]>();
  const errorMap = (issue: z.core.$ZodRawIssue): string | undefined => {
    const known = knownKeysOf(issue);
    if (known !== undefined) knownKeys.set(known.path, known.keys);
    return plainMessage(issue);
  };
  const result = schema.safeParse(input, { error: errorMap });
  if (result.success) return ok(result.data);
  return err(result.error.issues.map((issue) => fromZodIssue(issue, knownKeys)));
}
