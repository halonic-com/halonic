// Choices between schemas (union, discriminated union) and their
// combination (intersection).
import { EnumSchema, LiteralSchema, type LiteralValue } from "./basic.ts";
import { describeValue, IssueCollector, type Path } from "./issue.ts";
import type { JsonSchema, JsonSchemaContext } from "./json-schema-context.ts";
import type { ObjectSchema, Shape, UnknownKeys } from "./object.ts";
import { hasOwnKey, isPlainMap, setOwnProperty } from "./own-property.ts";
import {
  type AnySchema,
  INVALID,
  type Infer,
  type InferInput,
  type Parsed,
  Schema,
  validValue,
  type WhenMissing,
} from "./schema.ts";

/** At least one schema. */
export type SchemaList = readonly [AnySchema, ...AnySchema[]];

/**
 * Accepts a value that matches any of its options; the first match wins.
 * When none matches but exactly one option failed only on checks (too
 * short, unknown key) rather than on shape, that option's issues are
 * reported, which points at the real problem. Otherwise there is one
 * `no_union_match` issue at the union's path. Made by `s.union([...])`.
 */
export class UnionSchema<Options extends SchemaList> extends Schema<
  Infer<Options[number]>,
  InferInput<Options[number]>
> {
  /** The schemas tried, in order. */
  readonly options: Options;
  // An object may leave the key out when any option allows that, as in
  // Zod. The derived type still lists the key as required.
  override readonly whenMissing: WhenMissing;
  override readonly optionalOutput: boolean;

  constructor(options: Options) {
    super();
    this.options = options;
    this.whenMissing = unionWhenMissing(options);
    this.optionalOutput = options.some((option) => option.optionalOutput);
  }

  override check(
    input: unknown,
    path: Path,
    issues: IssueCollector,
  ): Parsed<Infer<Options[number]>> {
    let closest: { readonly issues: IssueCollector; readonly parsed: Parsed<unknown> } | undefined;
    let closeCount = 0;
    for (const option of this.options) {
      const optionIssues = new IssueCollector();
      const parsed = option.check(input, path, optionIssues);
      if (parsed.valid && optionIssues.isEmpty) return parsed;
      if (parsed.valid) {
        closeCount++;
        closest ??= { issues: optionIssues, parsed };
      }
    }
    if (closeCount === 1 && closest !== undefined) {
      issues.adopt(closest.issues);
      return closest.parsed;
    }
    issues.reportFatal(
      "no_union_match",
      path,
      `Matches none of the ${this.options.length} allowed forms`,
    );
    return INVALID;
  }

  override toJsonSchemaNode(context: JsonSchemaContext): JsonSchema {
    const nodes = this.options.map((option) => option.toJsonSchemaNode(context));
    return typeListOf(nodes) ?? { anyOf: nodes };
  }
}

function unionWhenMissing(options: SchemaList): WhenMissing {
  if (options.some((option) => option.whenMissing === "defaulted")) return "defaulted";
  if (options.some((option) => option.whenMissing === "optional")) return "optional";
  return "required";
}

// Options that only name a type, such as string | number | null, are written
// as `type: ["string", "number", "null"]`: the same meaning, and the form Zod wrote.
function typeListOf(nodes: readonly JsonSchema[]): JsonSchema | undefined {
  const types: string[] = [];
  for (const node of nodes) {
    const keys = Object.keys(node);
    if (keys.length !== 1 || keys[0] !== "type") return undefined;
    const type = node["type"];
    const members = Array.isArray(type) ? type : [type];
    for (const member of members) {
      if (typeof member !== "string") return undefined;
      if (!types.includes(member)) types.push(member);
    }
  }
  if (types.length === 0) return undefined;
  return { type: types.length === 1 ? (types[0] ?? null) : types };
}

/** An object schema that can be an option of a discriminated union. */
export type AnyObjectSchema = AnySchema & Pick<ObjectSchema<Shape, UnknownKeys>, "shape">;

/**
 * Accepts a map whose `key` value picks which object schema checks it, such
 * as `type: text | choice | json`. Faster than a union, and issues point
 * into the chosen option. Made by `s.discriminatedUnion(key, [...])`.
 *
 * @throws Error when an option's `key` isn't a literal or enum, or two options share a value
 */
export class DiscriminatedUnionSchema<
  Key extends string,
  Options extends readonly [AnyObjectSchema, ...AnyObjectSchema[]],
> extends Schema<Infer<Options[number]>, InferInput<Options[number]>> {
  /** The key whose value picks the option. */
  readonly key: Key;
  /** The object schemas, in order. */
  readonly options: Options;
  readonly #optionByValue = new Map<LiteralValue, AnyObjectSchema>();

  constructor(key: Key, options: Options) {
    super();
    this.key = key;
    this.options = options;
    for (const option of options) {
      for (const value of discriminatorValues(option, key)) {
        if (this.#optionByValue.has(value))
          throw new Error(`Two options use ${key}: ${JSON.stringify(value)}`);
        this.#optionByValue.set(value, option);
      }
    }
  }

  override check(
    input: unknown,
    path: Path,
    issues: IssueCollector,
  ): Parsed<Infer<Options[number]>> {
    if (!isPlainMap(input)) {
      issues.reportFatal("invalid_type", path, `Expected a map, got ${describeValue(input)}`);
      return INVALID;
    }
    const value = hasOwnKey(input, this.key) ? input[this.key] : undefined;
    const option = this.#findOption(value);
    if (option === undefined) {
      const allowed = [...this.#optionByValue.keys()].map((known) => String(known)).join(", ");
      issues.reportFatal(
        "unknown_discriminator",
        [...path, this.key],
        `Expected "${this.key}" to be one of: ${allowed}`,
      );
      return INVALID;
    }
    return option.check(input, path, issues);
  }

  override toJsonSchemaNode(context: JsonSchemaContext): JsonSchema {
    return { oneOf: this.options.map((option) => option.toJsonSchemaNode(context)) };
  }

  #findOption(value: unknown): AnyObjectSchema | undefined {
    if (!isLiteralValue(value)) return undefined;
    return this.#optionByValue.get(value);
  }
}

function discriminatorValues(option: AnyObjectSchema, key: string): readonly LiteralValue[] {
  const schema = option.shape[key];
  if (schema instanceof LiteralSchema) return [schema.value];
  if (schema instanceof EnumSchema) return schema.options;
  throw new Error(
    `Every option of a discriminated union needs "${key}" as an s.literal() or s.enum()`,
  );
}

function isLiteralValue(value: unknown): value is LiteralValue {
  const type = typeof value;
  return value === null || type === "string" || type === "number" || type === "boolean";
}

/**
 * Accepts a value that matches both schemas, and merges the two parsed
 * values (maps key by key). Made by `s.intersection(left, right)`.
 */
export class IntersectionSchema<Left extends AnySchema, Right extends AnySchema> extends Schema<
  Infer<Left> & Infer<Right>,
  InferInput<Left> & InferInput<Right>
> {
  /** The first schema. */
  readonly left: Left;
  /** The second schema. */
  readonly right: Right;

  constructor(left: Left, right: Right) {
    super();
    this.left = left;
    this.right = right;
  }

  override check(
    input: unknown,
    path: Path,
    issues: IssueCollector,
  ): Parsed<Infer<Left> & Infer<Right>> {
    const left = this.left.check(input, path, issues);
    const right = this.right.check(input, path, issues);
    if (!left.valid || !right.valid) return INVALID;
    const merged = mergeValues(left.value, right.value);
    if (!merged.valid) {
      issues.reportFatal("intersection_conflict", path, "The two parts of this value disagree");
      return INVALID;
    }
    return merged as Parsed<Infer<Left> & Infer<Right>>;
  }

  override toJsonSchemaNode(context: JsonSchemaContext): JsonSchema {
    return { allOf: [this.left.toJsonSchemaNode(context), this.right.toJsonSchemaNode(context)] };
  }
}

// Equal values merge to themselves; maps merge key by key and lists item by
// item. Anything else can't be both at once.
function mergeValues(left: unknown, right: unknown): Parsed<unknown> {
  if (Object.is(left, right)) return validValue(left);
  if (isPlainMap(left) && isPlainMap(right)) return mergeMaps(left, right);
  if (Array.isArray(left) && Array.isArray(right) && left.length === right.length) {
    const merged: unknown[] = [];
    for (const [index, item] of left.entries()) {
      const parsed = mergeValues(item, right[index]);
      if (!parsed.valid) return INVALID;
      merged.push(parsed.value);
    }
    return validValue(merged);
  }
  return INVALID;
}

// A key named __proto__ is dropped, as Zod did.
function mergeMaps(left: Record<string, unknown>, right: Record<string, unknown>): Parsed<unknown> {
  const merged: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(left)) {
    if (key !== "__proto__") setOwnProperty(merged, key, value);
  }
  for (const [key, value] of Object.entries(right)) {
    if (key === "__proto__") continue;
    if (!hasOwnKey(left, key)) {
      setOwnProperty(merged, key, value);
      continue;
    }
    const parsed = mergeValues(left[key], value);
    if (!parsed.valid) return INVALID;
    setOwnProperty(merged, key, parsed.value);
  }
  return validValue(merged);
}
