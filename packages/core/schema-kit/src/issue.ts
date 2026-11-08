import type { z } from "zod";

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

/** Turns one of Zod's issues into ours. */
export function fromZodIssue(issue: z.core.$ZodIssue): Issue {
  const path = issue.path.map(toPathSegment);
  if (issue.code === "unrecognized_keys") {
    return { code: issue.code, path, message: issue.message, keys: [...issue.keys] };
  }
  return { code: issue.code, path, message: issue.message };
}

// Parsed files only have text keys; a symbol can only come from code.
function toPathSegment(segment: PropertyKey): PathSegment {
  return typeof segment === "symbol" ? String(segment) : segment;
}
