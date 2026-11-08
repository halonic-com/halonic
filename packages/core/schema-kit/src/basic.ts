// The schemas with no options: boolean, null, unknown, literal and enum.
import { describeValue, type IssueCollector, type Path } from "./issue.ts";
import type { JsonSchema } from "./json-schema-context.ts";
import { INVALID, type Parsed, Schema, validValue } from "./schema.ts";

/** Accepts `true` and `false`. Made by `s.boolean()`. */
export class BooleanSchema extends Schema<boolean> {
  override check(input: unknown, path: Path, issues: IssueCollector): Parsed<boolean> {
    if (typeof input === "boolean") return validValue(input);
    issues.reportFatal("invalid_type", path, `Expected true or false, got ${describeValue(input)}`);
    return INVALID;
  }

  override toJsonSchemaNode(): JsonSchema {
    return { type: "boolean" };
  }
}

/** Accepts only `null`. Made by `s.null()`. */
export class NullSchema extends Schema<null> {
  override check(input: unknown, path: Path, issues: IssueCollector): Parsed<null> {
    if (input === null) return validValue(null);
    issues.reportFatal("invalid_type", path, `Expected null, got ${describeValue(input)}`);
    return INVALID;
  }

  override toJsonSchemaNode(): JsonSchema {
    return { type: "null" };
  }
}

/**
 * Accepts anything, including `undefined`. In an object the key must still
 * be there unless the schema is `.optional()`. Made by `s.unknown()`.
 */
export class UnknownSchema extends Schema<unknown> {
  override check(input: unknown): Parsed<unknown> {
    return validValue(input);
  }

  override toJsonSchemaNode(): JsonSchema {
    return {};
  }
}

/** A value a literal schema can stand for. */
export type LiteralValue = string | number | boolean | null;

/** Accepts exactly one value. Made by `s.literal(value)`. */
export class LiteralSchema<Value extends LiteralValue> extends Schema<Value> {
  /** The one accepted value. */
  readonly value: Value;

  constructor(value: Value) {
    super();
    this.value = value;
  }

  override check(input: unknown, path: Path, issues: IssueCollector): Parsed<Value> {
    if (input === this.value) return validValue(this.value);
    issues.reportFatal("invalid_value", path, `Expected ${JSON.stringify(this.value)}`);
    return INVALID;
  }

  override toJsonSchemaNode(): JsonSchema {
    if (this.value === null) return { type: "null", const: null };
    return { type: jsonTypeOf(this.value), const: this.value };
  }
}

/** Accepts one of a fixed list of texts. Made by `s.enum([...])`. */
export class EnumSchema<Values extends readonly [string, ...string[]]> extends Schema<
  Values[number]
> {
  /** The accepted texts, in order. */
  readonly options: Values;
  readonly #allowed: ReadonlySet<string>;

  constructor(options: Values) {
    super();
    this.options = options;
    this.#allowed = new Set(options);
  }

  override check(input: unknown, path: Path, issues: IssueCollector): Parsed<Values[number]> {
    if (typeof input === "string" && this.#allowed.has(input)) return validValue(input);
    issues.reportFatal("invalid_value", path, `Expected one of: ${this.options.join(", ")}`);
    return INVALID;
  }

  override toJsonSchemaNode(): JsonSchema {
    return { type: "string", enum: [...this.options] };
  }
}

function jsonTypeOf(value: string | number | boolean): string {
  if (typeof value === "string") return "string";
  if (typeof value === "number") return "number";
  return "boolean";
}
