import { describeValue, IssueCollector, type Path } from "./issue.ts";
import type { JsonSchema, JsonSchemaContext } from "./json-schema-context.ts";
import { hasOwnKey, isPlainMap, setOwnProperty } from "./own-property.ts";
import {
  type AnySchema,
  INVALID,
  type Infer,
  type InferInput,
  OptionalSchema,
  type Parsed,
  Schema,
  validValue,
} from "./schema.ts";

/** The keys of an object schema and the schema of each value. */
export type Shape = { readonly [key: string]: AnySchema };

/** What an object schema does with keys its shape doesn't name: drop them, refuse them or keep them. */
export type UnknownKeys = "strip" | "strict" | "passthrough";

type Simplify<T> = { [K in keyof T]: T[K] } & {};

type OptionalInputKey<S extends Shape> = {
  [K in keyof S]: S[K] extends { readonly whenMissing: "optional" | "defaulted" } ? K : never;
}[keyof S];

type OptionalOutputKey<S extends Shape> = {
  [K in keyof S]: S[K] extends { readonly optionalOutput: true } ? K : never;
}[keyof S];

/** The parsed type of an object with shape `S`: keys of `.optional()` schemas may be missing. */
export type ObjectOutput<S extends Shape> = Simplify<
  { [K in keyof S as K extends OptionalOutputKey<S> ? never : K]: Infer<S[K]> } & {
    [K in OptionalOutputKey<S>]?: Infer<S[K]>;
  }
>;

/** The accepted input of an object with shape `S`: keys of `.optional()` and `.default()` schemas may be missing. */
export type ObjectInput<S extends Shape> = Simplify<
  { [K in keyof S as K extends OptionalInputKey<S> ? never : K]: InferInput<S[K]> } & {
    [K in OptionalInputKey<S>]?: InferInput<S[K]>;
  }
>;

type WithUnknownKeys<T, Mode extends UnknownKeys> = Mode extends "passthrough"
  ? T & { [key: string]: unknown }
  : T;

/** `Base` with the keys of `Extra` added; a key in both takes `Extra`'s schema. */
export type ExtendedShape<Base extends Shape, Extra extends Shape> = Simplify<
  Omit<Base, keyof Extra> & Extra
>;

/** `S` with every schema made optional. */
export type PartialShape<S extends Shape> = { [K in keyof S]: OptionalSchema<S[K]> };

/**
 * Accepts a map with the keys of its shape. Made by `s.object({...})`.
 * Unknown keys are dropped unless `.strict()` refuses or `.passthrough()` keeps them.
 */
export class ObjectSchema<S extends Shape, Mode extends UnknownKeys = "strip"> extends Schema<
  WithUnknownKeys<ObjectOutput<S>, Mode>,
  WithUnknownKeys<ObjectInput<S>, Mode>
> {
  /** The keys and the schema of each value. */
  readonly shape: S;
  /** What happens to keys the shape doesn't name. */
  readonly unknownKeys: Mode;

  constructor(shape: S, unknownKeys: Mode) {
    super();
    this.shape = shape;
    this.unknownKeys = unknownKeys;
  }

  /** Refuses keys the shape doesn't name (one `unknown_keys` issue at the object's path). */
  strict(): ObjectSchema<S, "strict"> {
    return new ObjectSchema(this.shape, "strict");
  }

  /** Keeps keys the shape doesn't name, unchecked. A key named `__proto__` is dropped. */
  passthrough(): ObjectSchema<S, "passthrough"> {
    return new ObjectSchema(this.shape, "passthrough");
  }

  /** Adds keys to the shape, or replaces their schemas. Keeps the unknown-key mode. */
  extend<Extra extends Shape>(extra: Extra): ObjectSchema<ExtendedShape<S, Extra>, Mode> {
    const shape = { ...this.shape, ...extra } as ExtendedShape<S, Extra>;
    return new ObjectSchema(shape, this.unknownKeys);
  }

  /** Makes every key optional. Keeps the unknown-key mode. */
  partial(): ObjectSchema<PartialShape<S>, Mode> {
    const shape: Record<string, AnySchema> = {};
    for (const [key, schema] of Object.entries(this.shape)) {
      setOwnProperty(shape, key, new OptionalSchema(schema));
    }
    return new ObjectSchema(shape as PartialShape<S>, this.unknownKeys);
  }

  override check(
    input: unknown,
    path: Path,
    issues: IssueCollector,
  ): Parsed<WithUnknownKeys<ObjectOutput<S>, Mode>> {
    if (!isPlainMap(input)) {
      issues.reportFatal("invalid_type", path, `Expected a map, got ${describeValue(input)}`);
      return INVALID;
    }
    const output: Record<string, unknown> = {};
    let valid = true;
    for (const [key, schema] of Object.entries(this.shape)) {
      if (!this.#checkKey(input, key, schema, output, path, issues)) valid = false;
    }
    this.#handleUnknownKeys(input, output, path, issues);
    if (!valid) return INVALID;
    return validValue(output as WithUnknownKeys<ObjectOutput<S>, Mode>);
  }

  override toJsonSchemaNode(context: JsonSchemaContext): JsonSchema {
    const properties: JsonSchema = {};
    const required: string[] = [];
    for (const [key, schema] of Object.entries(this.shape)) {
      setOwnProperty(properties, key, schema.toJsonSchemaNode(context));
      if (schema.whenMissing === "required") required.push(key);
    }
    const node: JsonSchema = { type: "object", properties };
    if (required.length > 0) node["required"] = required;
    if (this.unknownKeys === "strict") node["additionalProperties"] = false;
    if (this.unknownKeys === "passthrough") node["additionalProperties"] = {};
    return node;
  }

  // Returns false after a fatal issue.
  #checkKey(
    input: Record<string, unknown>,
    key: string,
    schema: AnySchema,
    output: Record<string, unknown>,
    path: Path,
    issues: IssueCollector,
  ): boolean {
    const keyPath = [...path, key];
    if (!hasOwnKey(input, key)) return this.#checkMissingKey(key, schema, output, keyPath, issues);
    const parsed = schema.check(input[key], keyPath, issues);
    if (!parsed.valid) return false;
    setOwnProperty(output, key, parsed.value);
    return true;
  }

  // A missing key follows Zod's rules: a required one is an issue, an
  // optional one stays out, and a default is filled in. Under .optional(),
  // a default that fails its refinement leaves the key out instead.
  #checkMissingKey(
    key: string,
    schema: AnySchema,
    output: Record<string, unknown>,
    keyPath: Path,
    issues: IssueCollector,
  ): boolean {
    if (schema.whenMissing === "required") {
      issues.reportFatal("required", keyPath, `Missing required key "${key}"`);
      return false;
    }
    if (schema.whenMissing === "optional" && schema.optionalOutput) return true;
    const fillIssues = schema.optionalOutput ? new IssueCollector() : issues;
    const parsed = schema.check(undefined, keyPath, fillIssues);
    if (schema.optionalOutput && (!parsed.valid || !fillIssues.isEmpty)) return true;
    if (!parsed.valid) return false;
    const keepsUndefined = schema.whenMissing === "defaulted" && !schema.optionalOutput;
    if (parsed.value !== undefined || keepsUndefined) setOwnProperty(output, key, parsed.value);
    return true;
  }

  #handleUnknownKeys(
    input: Record<string, unknown>,
    output: Record<string, unknown>,
    path: Path,
    issues: IssueCollector,
  ): void {
    if (this.unknownKeys === "strip") return;
    const unknown: string[] = [];
    for (const key of Object.keys(input)) {
      if (hasOwnKey(this.shape, key)) continue;
      if (this.unknownKeys === "strict") unknown.push(key);
      // Kept keys never include __proto__: Zod turned it into a prototype
      // change, so it never showed up as a key, and it shouldn't here either.
      else if (key !== "__proto__") setOwnProperty(output, key, input[key]);
    }
    if (unknown.length === 0) return;
    const names = unknown.map((key) => `"${key}"`).join(", ");
    issues.report(
      "unknown_keys",
      path,
      unknown.length === 1 ? `Unknown key ${names}` : `Unknown keys ${names}`,
    );
  }
}
