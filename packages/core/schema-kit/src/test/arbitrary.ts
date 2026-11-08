// Generates inputs for a schema: mostly close to valid, so the checks deep
// inside get exercised, with wrong types, missing and extra keys, edge
// values and odd Unicode mixed in.
import fc from "fast-check";
import {
  type AnySchema,
  ArraySchema,
  BooleanSchema,
  DefaultSchema,
  DiscriminatedUnionSchema,
  EnumSchema,
  IntersectionSchema,
  LazySchema,
  LiteralSchema,
  NullSchema,
  NumberSchema,
  ObjectSchema,
  OptionalSchema,
  RecordSchema,
  RefinedSchema,
  type Shape,
  StringSchema,
  TupleSchema,
  UnionSchema,
  UnknownSchema,
} from "../index.ts";

/** How deep recursive schemas go before only leaves are generated. */
const MAX_GENERATED_DEPTH = 6;

/** Texts that hit the patterns, formats and lengths in the old schemas. */
export const interestingTexts = fc.constantFrom(
  "",
  "a",
  "abc",
  "my-id",
  "my_id",
  "My-Id",
  "-dash",
  "30m",
  "0m",
  "2d",
  "1h",
  "input.message",
  "context.a.b",
  "tags",
  "#3B82F6",
  "#3b82f",
  "https://example.com/mcp",
  "http://localhost:8080",
  " https://example.com ",
  "not a url",
  "family@example.com",
  "a@b",
  "text",
  "choice",
  "json",
  "ref",
  "local",
  "__proto__",
  "constructor",
  "Ünïcödé",
  "😀",
  "\u0000",
);

const anyText = fc.oneof(
  { weight: 3, arbitrary: interestingTexts },
  { weight: 1, arbitrary: fc.string({ maxLength: 12 }) },
  { weight: 1, arbitrary: fc.string({ unit: "binary", maxLength: 6 }) },
);

const anyNumber = fc.oneof(
  fc.constantFrom(
    0,
    -0,
    1,
    -1,
    1.5,
    2,
    6,
    16,
    17,
    64,
    65,
    200,
    201,
    2 ** 53,
    2 ** 60,
    Number.NaN,
    Number.POSITIVE_INFINITY,
  ),
  fc.integer({ min: -1000, max: 1000 }),
  fc.double(),
);

/** Any small value, used to put a wrong type anywhere. */
export const anyValue: fc.Arbitrary<unknown> = fc.oneof(
  anyText,
  anyNumber,
  fc.boolean(),
  fc.constant(null),
  fc.constant(undefined),
  fc.constant([]),
  fc.constant({}),
  fc.array(anyText, { maxLength: 2 }),
  fc.dictionary(anyText, anyText, { maxKeys: 2 }),
);

/**
 * How far generated inputs stray from the schema. "high": one value in ten
 * has a random type and keys go missing often, for the error paths. "low":
 * mostly valid documents, so parsed values and defaults get compared too.
 */
export type Noise = "high" | "low";

/** An input for `schema`. */
export function inputFor(schema: AnySchema, noise: Noise = "high"): fc.Arbitrary<unknown> {
  return new InputGenerator(noise).input(schema, 0);
}

class InputGenerator {
  readonly #wrongTypeWeight: number;
  readonly #missingKeyWeight: number;
  readonly #text: fc.Arbitrary<string>;

  constructor(noise: Noise) {
    this.#wrongTypeWeight = noise === "high" ? 10 : 1;
    this.#missingKeyWeight = noise === "high" ? 10 : 2;
    this.#text = noise === "high" ? anyText : interestingTexts;
  }

  input(schema: AnySchema, depth: number): fc.Arbitrary<unknown> {
    return fc.oneof(
      { weight: 100 - this.#wrongTypeWeight, arbitrary: this.#shaped(schema, depth) },
      { weight: this.#wrongTypeWeight, arbitrary: anyValue },
    );
  }

  #shaped(schema: AnySchema, depth: number): fc.Arbitrary<unknown> {
    if (schema instanceof OptionalSchema || schema instanceof DefaultSchema) {
      return fc.oneof(fc.constant(undefined), this.input(schema.inner, depth));
    }
    if (schema instanceof RefinedSchema) return this.#shaped(schema.inner, depth);
    if (schema instanceof LazySchema) {
      if (depth >= MAX_GENERATED_DEPTH) return anyValue;
      return fc.constant(null).chain(() => this.input(schema.schema, depth + 1));
    }
    if (schema instanceof StringSchema) return this.#text;
    if (schema instanceof NumberSchema) return anyNumber;
    if (schema instanceof BooleanSchema) return fc.boolean();
    if (schema instanceof NullSchema) return fc.constant(null);
    if (schema instanceof UnknownSchema) return anyValue;
    if (schema instanceof LiteralSchema) return fc.constant(schema.value);
    if (schema instanceof EnumSchema) return fc.constantFrom(...schema.options);
    if (schema instanceof ObjectSchema) return this.#object(schema, depth);
    if (schema instanceof ArraySchema)
      return fc.array(this.input(schema.item, depth + 1), { maxLength: 3 });
    if (schema instanceof TupleSchema) return this.#tuple(schema, depth);
    if (schema instanceof RecordSchema) {
      return dictionary(this.#shaped(schema.key, depth), this.input(schema.value, depth + 1));
    }
    if (schema instanceof UnionSchema || schema instanceof DiscriminatedUnionSchema) {
      const options: readonly AnySchema[] = schema.options;
      return fc.oneof(...options.map((option) => this.#shaped(option, depth)));
    }
    if (schema instanceof IntersectionSchema) {
      return fc
        .tuple(this.#shaped(schema.left, depth), this.#shaped(schema.right, depth))
        .map(([left, right]) => mergeIfMaps(left, right));
    }
    throw new Error(`No generator for ${schema.constructor.name}`);
  }

  #object(schema: { readonly shape: Shape }, depth: number): fc.Arbitrary<unknown> {
    const entries = Object.entries(schema.shape).map(([key, value]) =>
      fc
        .oneof(
          { weight: 100 - this.#missingKeyWeight, arbitrary: this.input(value, depth + 1) },
          { weight: this.#missingKeyWeight, arbitrary: fc.constant(OMITTED) },
        )
        .map((generated) => [key, generated] as const),
    );
    const extra = fc.oneof(
      { weight: 100 - this.#missingKeyWeight * 2, arbitrary: fc.constant({}) },
      { weight: this.#missingKeyWeight * 2, arbitrary: dictionary(anyText, anyValue) },
    );
    return fc.tuple(fc.tuple(...entries), extra).map(([knownEntries, extraValues]) => {
      const known: Record<string, unknown> = {};
      for (const [key, generated] of knownEntries) {
        if (generated !== OMITTED) known[key] = generated;
      }
      return mergeIfMaps(extraValues, known);
    });
  }

  #tuple(schema: { readonly items: readonly AnySchema[] }, depth: number): fc.Arbitrary<unknown> {
    const exact = fc.tuple(...schema.items.map((item) => this.input(item, depth + 1)));
    return fc.oneof(
      { weight: 100 - this.#wrongTypeWeight, arbitrary: exact },
      {
        weight: this.#wrongTypeWeight,
        arbitrary: fc.array(anyValue, { maxLength: schema.items.length + 1 }),
      },
    );
  }
}

const OMITTED = Symbol("omitted");

// fc.dictionary would assign keys with `=`, which turns "__proto__" into a prototype change.
function dictionary(
  key: fc.Arbitrary<unknown>,
  value: fc.Arbitrary<unknown>,
): fc.Arbitrary<Record<string, unknown>> {
  return fc.array(fc.tuple(key, value), { maxLength: 3 }).map((entries) => {
    const map: Record<string, unknown> = {};
    for (const [entryKey, entryValue] of entries) {
      Object.defineProperty(map, String(entryKey), {
        value: entryValue,
        enumerable: true,
        writable: true,
        configurable: true,
      });
    }
    return map;
  });
}

function mergeIfMaps(left: unknown, right: unknown): unknown {
  const isMap = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null && !Array.isArray(value);
  if (!isMap(left) || !isMap(right)) return right;
  const merged: Record<string, unknown> = {};
  for (const source of [left, right]) {
    for (const [key, value] of Object.entries(source)) {
      Object.defineProperty(merged, key, {
        value,
        enumerable: true,
        writable: true,
        configurable: true,
      });
    }
  }
  return merged;
}
