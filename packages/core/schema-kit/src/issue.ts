/** One step in the path to a value: an object key or an array index. */
export type PathSegment = string | number;

/** Where a value sits inside the parsed input, from the root down. `[]` is the root itself. */
export type Path = readonly PathSegment[];

/**
 * What kind of problem an issue reports. The codes are stable; the messages
 * are for people and may be reworded.
 */
export type IssueCode =
  | "invalid_type"
  | "required"
  | "invalid_value"
  | "too_small"
  | "too_big"
  | "not_integer"
  | "invalid_format"
  | "unknown_keys"
  | "invalid_key"
  | "no_union_match"
  | "unknown_discriminator"
  | "intersection_conflict"
  | "too_deep"
  | "custom";

/** One problem found while parsing. The YAML layer turns `path` into a line and column. */
export interface Issue {
  readonly code: IssueCode;
  readonly path: Path;
  readonly message: string;
}

/**
 * How much an issue stops. "check": the value keeps its shape (too short,
 * unknown key), so refinements around it still run. "fatal": the value has
 * no usable shape (wrong type, missing key), so refinements are skipped.
 * "halt": fatal, and the length checks of the lists around it are skipped
 * too (a fraction where a whole number belongs, a list over its maximum).
 * These are Zod's rules, kept so that the same files fail at the same paths.
 */
type Severity = "check" | "fatal" | "halt";

interface RecordedIssue extends Issue {
  readonly severity: Severity;
}

/** Collects the issues of one parse. Schemas add to it while they walk the input. */
export class IssueCollector {
  readonly #issues: RecordedIssue[] = [];

  /** Adds an issue that leaves the value's shape usable. */
  report(code: IssueCode, path: Path, message: string): void {
    this.#issues.push({ code, path, message, severity: "check" });
  }

  /** Adds an issue after which the value has no usable shape. */
  reportFatal(code: IssueCode, path: Path, message: string): void {
    this.#issues.push({ code, path, message, severity: "fatal" });
  }

  /** Adds a fatal issue that also stops the length checks of enclosing lists. */
  reportHalt(code: IssueCode, path: Path, message: string): void {
    this.#issues.push({ code, path, message, severity: "halt" });
  }

  /** Copies every issue of another collector into this one. */
  adopt(other: IssueCollector): void {
    this.#issues.push(...other.#issues);
  }

  /** The number of issues so far; pass it to `hasHaltSince` to look at later ones only. */
  get count(): number {
    return this.#issues.length;
  }

  /** Whether any issue was added at all. */
  get isEmpty(): boolean {
    return this.#issues.length === 0;
  }

  /** Whether a halting issue was added at or after `start`. */
  hasHaltSince(start: number): boolean {
    for (let index = start; index < this.#issues.length; index++) {
      if (this.#issues[index]?.severity === "halt") return true;
    }
    return false;
  }

  /** The issues as the public API shows them, without the internal severity. */
  toIssues(): Issue[] {
    const issues: Issue[] = [];
    for (const recorded of this.#issues) {
      issues.push({ code: recorded.code, path: recorded.path, message: recorded.message });
    }
    return issues;
  }
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

/** Thrown by `Schema.parse` when the input doesn't match. Carries every issue. */
export class SchemaError extends Error {
  readonly issues: readonly Issue[];

  constructor(issues: readonly Issue[]) {
    super(describeIssues(issues));
    this.name = "SchemaError";
    this.issues = issues;
  }
}

function describeIssues(issues: readonly Issue[]): string {
  const lines: string[] = [];
  for (const issue of issues) {
    const where = issue.path.length === 0 ? "(root)" : formatPath(issue.path);
    lines.push(`${where}: ${issue.message}`);
  }
  return lines.join("\n");
}

/** Describes a value's type for messages: "a string", "null", "an array". */
export function describeValue(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "nothing";
  if (Array.isArray(value)) return "a list";
  if (typeof value === "number" && Number.isNaN(value)) return "NaN";
  switch (typeof value) {
    case "string":
      return "text";
    case "number":
    case "bigint":
      return "a number";
    case "boolean":
      return "true or false";
    case "object":
      return "a map";
    default:
      return `a ${typeof value}`;
  }
}
