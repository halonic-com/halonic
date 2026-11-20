import { ZodObject, type z } from "zod";

/** One step in the path to a value: an object key or a list index. */
export type PathSegment = string | number;

/** Where a value sits inside the parsed input, from the root down. `[]` is the root itself. */
export type Path = readonly PathSegment[];

/**
 * What kind of problem an issue reports. All but `too_deep` are Zod's codes.
 * The codes are stable; the messages are for people and may be reworded.
 */
export type IssueCode =
  | "invalid_type"
  | "too_big"
  | "too_small"
  | "invalid_format"
  | "not_multiple_of"
  | "unrecognized_keys"
  | "invalid_union"
  | "invalid_key"
  | "invalid_element"
  | "invalid_value"
  | "custom"
  | "too_deep";

/** One problem found while parsing. The YAML layer turns `path` into a line and column. */
export interface Issue {
  readonly code: IssueCode;
  readonly path: Path;
  readonly message: string;
  /** For `unrecognized_keys`: the keys the object doesn't allow. The path is the object's. */
  readonly keys?: readonly string[];
  /** For `unrecognized_keys`: every key the object does allow, required or not, for "Did you mean". */
  readonly knownKeys?: readonly string[];
}

/** Formats a path for messages: `deployments.prod.name`, `cases[0].events[2]`. */
export function formatPath(path: Path): string {
  let text = "";
  for (const segment of path) {
    if (typeof segment === "number") text += `[${segment}]`;
    else text += text === "" ? segment : `.${segment}`;
  }
  return text;
}

/**
 * Turns one of Zod's issues into ours.
 *
 * @param knownKeys - the keys each object allows, by its formatted path (see {@link knownKeysOf})
 */
export function fromZodIssue(
  issue: z.core.$ZodIssue,
  knownKeys: ReadonlyMap<string, readonly string[]> = new Map(),
): Issue {
  const path = issue.path.map(toPathSegment);
  if (issue.code === "unrecognized_keys") {
    const known = knownKeys.get(formatPath(path));
    const unrecognized = { code: issue.code, path, message: issue.message, keys: [...issue.keys] };
    return known === undefined ? unrecognized : { ...unrecognized, knownKeys: known };
  }
  return { code: issue.code, path, message: issue.message };
}

/**
 * The keys an object allows, from the raw issue Zod hands its error map. Only
 * the raw issue names the object's schema; the finished one leaves it out.
 * Returns `undefined` for other issues.
 */
export function knownKeysOf(
  issue: z.core.$ZodRawIssue,
): { readonly path: string; readonly keys: readonly string[] } | undefined {
  if (issue.code !== "unrecognized_keys" || !(issue.inst instanceof ZodObject)) {
    return undefined;
  }
  // The object's own path; Zod fills in `[]` for the top only when it finishes the issue.
  const path = (issue.path ?? []).map(toPathSegment);
  return { path: formatPath(path), keys: Object.keys(issue.inst.shape) };
}

// Parsed files only have text keys; a symbol can only come from code.
function toPathSegment(segment: PropertyKey): PathSegment {
  return typeof segment === "symbol" ? String(segment) : segment;
}
