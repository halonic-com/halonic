import { describeValue, type IssueCollector, type Path } from "./issue.ts";
import type { JsonSchema } from "./json-schema-context.ts";
import { INVALID, type Parsed, Schema, validValue } from "./schema.ts";

type NumberCheck =
  | { readonly kind: "min"; readonly limit: number }
  | { readonly kind: "max"; readonly limit: number }
  | { readonly kind: "positive" }
  | { readonly kind: "int" };

/**
 * Accepts finite numbers (not NaN or Infinity). Made by `s.number()`; each
 * check method returns a new schema. Checks run in the order they were added.
 */
export class NumberSchema extends Schema<number> {
  readonly #checks: readonly NumberCheck[];

  constructor(checks: readonly NumberCheck[] = []) {
    super();
    this.#checks = checks;
  }

  /** At least `limit`. */
  min(limit: number): NumberSchema {
    return this.#with({ kind: "min", limit });
  }

  /** At most `limit`. */
  max(limit: number): NumberSchema {
    return this.#with({ kind: "max", limit });
  }

  /** Greater than 0. */
  positive(): NumberSchema {
    return this.#with({ kind: "positive" });
  }

  /**
   * A whole number that JavaScript holds exactly (up to 2^53 − 1 either way).
   * A fraction stops the checks after this one; a too-large whole number doesn't.
   */
  int(): NumberSchema {
    return this.#with({ kind: "int" });
  }

  override check(input: unknown, path: Path, issues: IssueCollector): Parsed<number> {
    if (typeof input !== "number" || !Number.isFinite(input)) {
      issues.reportFatal(
        "invalid_type",
        path,
        `Expected a finite number, got ${describeValue(input)}`,
      );
      return INVALID;
    }
    for (const check of this.#checks) {
      if (!runCheck(check, input, path, issues)) return INVALID;
    }
    return validValue(input);
  }

  // Several limits on one side narrow to the strictest. A whole number also
  // has the safe-integer range as limits, as Zod wrote them.
  override toJsonSchemaNode(): JsonSchema {
    let minimum = Number.NEGATIVE_INFINITY;
    let maximum = Number.POSITIVE_INFINITY;
    let exclusiveMinimum: number | undefined;
    let integer = false;
    for (const check of this.#checks) {
      if (check.kind === "min") minimum = Math.max(minimum, check.limit);
      if (check.kind === "max") maximum = Math.min(maximum, check.limit);
      if (check.kind === "positive") exclusiveMinimum = Math.max(exclusiveMinimum ?? 0, 0);
      if (check.kind === "int") {
        integer = true;
        minimum = Math.max(minimum, Number.MIN_SAFE_INTEGER);
        maximum = Math.min(maximum, Number.MAX_SAFE_INTEGER);
      }
    }
    const node: JsonSchema = { type: integer ? "integer" : "number" };
    if (exclusiveMinimum !== undefined && exclusiveMinimum >= minimum)
      node["exclusiveMinimum"] = exclusiveMinimum;
    else if (Number.isFinite(minimum)) node["minimum"] = minimum;
    if (Number.isFinite(maximum)) node["maximum"] = maximum;
    return node;
  }

  #with(check: NumberCheck): NumberSchema {
    return new NumberSchema([...this.#checks, check]);
  }
}

// Returns false after a fatal issue: the checks after it are skipped.
function runCheck(check: NumberCheck, value: number, path: Path, issues: IssueCollector): boolean {
  switch (check.kind) {
    case "min":
      if (value < check.limit) issues.report("too_small", path, `Expected at least ${check.limit}`);
      return true;
    case "max":
      if (value > check.limit) issues.report("too_big", path, `Expected at most ${check.limit}`);
      return true;
    case "positive":
      if (value <= 0) issues.report("too_small", path, "Expected a number greater than 0");
      return true;
    case "int":
      return checkInteger(value, path, issues);
  }
}

function checkInteger(value: number, path: Path, issues: IssueCollector): boolean {
  if (!Number.isInteger(value)) {
    issues.reportHalt("not_integer", path, `Expected a whole number, got ${value}`);
    return false;
  }
  if (value > Number.MAX_SAFE_INTEGER)
    issues.report("too_big", path, "Expected a whole number of at most 2^53 − 1");
  if (value < Number.MIN_SAFE_INTEGER)
    issues.report("too_small", path, "Expected a whole number of at least −(2^53 − 1)");
  return true;
}
