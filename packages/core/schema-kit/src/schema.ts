// The base class every schema extends, and the three wrappers any schema can
// take: optional, default and refine. They live in this one file because the
// base class creates them, and splitting them would make a module cycle.
import { type Issue, IssueCollector, type Path, SchemaError } from "./issue.ts";
import type { JsonSchema, JsonSchemaContext } from "./json-schema-context.ts";
import { err, ok, type Result } from "./result.ts";

/**
 * What a schema hands back to the schema around it. `valid: false` means it
 * reported a fatal issue and has no value; `valid: true` means the value has
 * the right shape, though non-fatal issues (too short, unknown key) may exist.
 */
export type Parsed<Value> =
  | { readonly valid: true; readonly value: Value }
  | { readonly valid: false };

/** The `Parsed` result for a value that has a usable shape. */
export function validValue<Value>(value: Value): Parsed<Value> {
  return { valid: true, value };
}

/** The `Parsed` result after a fatal issue. */
export const INVALID: Parsed<never> = { valid: false };

/**
 * What an object does when a key with this schema is missing from its input:
 * report it ("required"), leave it out ("optional") or fill in a default
 * ("defaulted"). The same rule decides how many tuple items may be left off.
 */
export type WhenMissing = "required" | "optional" | "defaulted";

/** Reports a problem from a refinement. `path` is relative to the refined value. */
export type ReportIssue = (message: string, path?: Path) => void;

/**
 * Any schema, whatever it parses to. A structural type rather than
 * `Schema<unknown, unknown>`: methods such as `refine` take the output type
 * as a parameter, which would stop a `Schema<string>` from fitting.
 */
export interface AnySchema {
  /** Type only: the parsed type. */
  readonly _output: unknown;
  /** Type only: the accepted input type. */
  readonly _input: unknown;
  /** What an object does when this key is missing from its input. */
  readonly whenMissing: WhenMissing;
  /** Whether a key with this schema may be missing from the parsed object. */
  readonly optionalOutput: boolean;
  /** Checks `input` at `path`; see `Schema.check`. */
  check(input: unknown, path: Path, issues: IssueCollector): Parsed<this["_output"]>;
  /** Describes the schema as JSON Schema; see `Schema.toJsonSchemaNode`. */
  toJsonSchemaNode(context: JsonSchemaContext): JsonSchema;
}

/** The type a schema parses to, like `z.infer`. */
export type Infer<S extends AnySchema> = S["_output"];

/** The type a schema accepts as input, before defaults are filled in. */
export type InferInput<S extends AnySchema> = S["_input"];

/**
 * A schema: it checks unknown input and returns a typed value or a list of
 * issues with paths. Build one with the `s` builders, not with `new`.
 *
 * @typeParam Output - what `parse` returns
 * @typeParam Input - what `parse` accepts, before defaults are filled in
 */
export abstract class Schema<Output, Input = Output> {
  /** Type only: the parsed type. Use `Infer<typeof schema>`. */
  declare readonly _output: Output;
  /** Type only: the accepted input type. Use `InferInput<typeof schema>`. */
  declare readonly _input: Input;
  /** What an object does when this key is missing from its input. */
  readonly whenMissing: WhenMissing = "required";
  /** Whether a key with this schema may be missing from the parsed object. */
  readonly optionalOutput: boolean = false;

  /**
   * Checks `input`, which sits at `path` in the whole input, and reports
   * problems to `issues`. Called by the schemas around this one; use
   * `parse` or `safeParse` from outside.
   */
  abstract check(input: unknown, path: Path, issues: IssueCollector): Parsed<Output>;

  /** Describes this schema as JSON Schema. Use `toJsonSchema` from outside. */
  abstract toJsonSchemaNode(context: JsonSchemaContext): JsonSchema;

  /**
   * Checks `input` and returns the typed value.
   *
   * @throws SchemaError with every issue when the input doesn't match
   */
  parse(input: unknown): Output {
    const result = this.safeParse(input);
    if (!result.ok) throw new SchemaError(result.error);
    return result.value;
  }

  /** Checks `input` and returns the typed value, or every issue found. Never throws for bad input. */
  safeParse(input: unknown): Result<Output, Issue[]> {
    const issues = new IssueCollector();
    const parsed = this.check(input, [], issues);
    if (parsed.valid && issues.isEmpty) return ok(parsed.value);
    return err(issues.toIssues());
  }

  /** Also accepts `undefined`, and lets an object leave the key out. */
  optional(): OptionalSchema<this> {
    return new OptionalSchema(this);
  }

  /**
   * Uses `value` when the input is `undefined` or the key is left out. The
   * value isn't checked. Objects and lists are copied (one level deep) for
   * each use, so a parsed value never shares them with the schema.
   */
  default(value: Exclude<Output, undefined>): DefaultSchema<this> {
    return new DefaultSchema(this, value);
  }

  /**
   * Adds a check of your own. It runs only when the value has a usable shape.
   *
   * @param predicate - returns false when the value is wrong
   * @param message - the issue's message, reported at this schema's path
   */
  refine(predicate: (value: Output) => boolean, message: string): RefinedSchema<this> {
    return new RefinedSchema(this, (value, report) => {
      if (!predicate(value)) report(message);
    });
  }

  /**
   * Adds a check that can report several issues, each with its own path.
   *
   * @example
   * field.refineWith((value, report) => {
   *   if (value.type === "choice" && value.values === undefined) report("A choice field needs values");
   * });
   */
  refineWith(check: (value: Output, report: ReportIssue) => void): RefinedSchema<this> {
    return new RefinedSchema(this, check);
  }
}

/**
 * A schema that also accepts `undefined`. Made by `.optional()`. Around a
 * schema with a default, `undefined` still gets the default, as in Zod.
 */
export class OptionalSchema<Inner extends AnySchema> extends Schema<
  Infer<Inner> | undefined,
  InferInput<Inner> | undefined
> {
  override readonly whenMissing: "optional" | "defaulted";
  override readonly optionalOutput = true;
  /** The schema for values that aren't `undefined`. */
  readonly inner: Inner;

  constructor(inner: Inner) {
    super();
    this.inner = inner;
    this.whenMissing = inner.whenMissing === "defaulted" ? "defaulted" : "optional";
  }

  override check(
    input: unknown,
    path: Path,
    issues: IssueCollector,
  ): Parsed<Infer<Inner> | undefined> {
    if (input !== undefined) return this.inner.check(input, path, issues);
    if (this.whenMissing !== "defaulted") return validValue(undefined);
    // Let the inner schema fill in its default. If that fails (a refinement
    // rejects the default), the value is simply missing.
    const defaultIssues = new IssueCollector();
    const filled = this.inner.check(undefined, path, defaultIssues);
    if (!filled.valid || !defaultIssues.isEmpty) return validValue(undefined);
    return filled;
  }

  override toJsonSchemaNode(context: JsonSchemaContext): JsonSchema {
    return this.inner.toJsonSchemaNode(context);
  }
}

/** A schema that fills in a value for `undefined`. Made by `.default()`. */
export class DefaultSchema<Inner extends AnySchema> extends Schema<
  Exclude<Infer<Inner>, undefined>,
  InferInput<Inner> | undefined
> {
  override readonly whenMissing = "defaulted";
  override readonly optionalOutput = false;
  /** The schema for values that aren't `undefined`. */
  readonly inner: Inner;
  /** The value used for `undefined`. */
  readonly defaultValue: Exclude<Infer<Inner>, undefined>;

  constructor(inner: Inner, defaultValue: Exclude<Infer<Inner>, undefined>) {
    super();
    this.inner = inner;
    this.defaultValue = defaultValue;
  }

  override check(
    input: unknown,
    path: Path,
    issues: IssueCollector,
  ): Parsed<Exclude<Infer<Inner>, undefined>> {
    if (input === undefined) return validValue(copyOneLevel(this.defaultValue));
    // The inner schema only sees values other than undefined here, so it
    // only returns undefined if it turns a value into undefined, which no
    // schema in this package does.
    return this.inner.check(input, path, issues) as Parsed<Exclude<Infer<Inner>, undefined>>;
  }

  override toJsonSchemaNode(context: JsonSchemaContext): JsonSchema {
    return {
      ...this.inner.toJsonSchemaNode(context),
      default: context.toJsonValue(this.defaultValue),
    };
  }
}

// Method syntax on purpose: method parameters are compared both ways, so a
// RefinedSchema<LazySchema<Guard>> still fits where a Schema<Guard> is expected.
interface Refinement<Value> {
  run(value: Value, report: ReportIssue): void;
}

/** A schema with an extra check of your own. Made by `.refine()` and `.refineWith()`. */
export class RefinedSchema<Inner extends AnySchema> extends Schema<
  Infer<Inner>,
  InferInput<Inner>
> {
  override readonly whenMissing: Inner["whenMissing"];
  override readonly optionalOutput: Inner["optionalOutput"];
  /** The schema whose values are refined. */
  readonly inner: Inner;
  readonly #refinement: Refinement<Infer<Inner>>;

  constructor(inner: Inner, refinement: (value: Infer<Inner>, report: ReportIssue) => void) {
    super();
    this.inner = inner;
    this.whenMissing = inner.whenMissing;
    this.optionalOutput = inner.optionalOutput;
    this.#refinement = { run: refinement };
  }

  override check(input: unknown, path: Path, issues: IssueCollector): Parsed<Infer<Inner>> {
    const parsed = this.inner.check(input, path, issues);
    if (!parsed.valid) return parsed;
    this.#refinement.run(parsed.value, (message, relativePath = []) => {
      issues.report("custom", [...path, ...relativePath], message);
    });
    return parsed;
  }

  override toJsonSchemaNode(context: JsonSchemaContext): JsonSchema {
    return this.inner.toJsonSchemaNode(context);
  }
}

function copyOneLevel<Value>(value: Value): Value {
  if (Array.isArray(value)) return [...value] as Value;
  if (typeof value === "object" && value !== null) return { ...value };
  return value;
}
