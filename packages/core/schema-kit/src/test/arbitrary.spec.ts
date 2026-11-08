// Generates inputs for a schema: mostly close to valid, so the checks deep
// inside get exercised, with wrong types, missing and extra keys, edge
// values and odd Unicode mixed in.
import fc from "fast-check";
import type { z } from "zod";
import type { Schema } from "../index.ts";

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
export function inputFor(schema: Schema, noise: Noise = "high"): fc.Arbitrary<unknown> {
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

  input(schema: Schema, depth: number): fc.Arbitrary<unknown> {
    return fc.oneof(
      { weight: 100 - this.#wrongTypeWeight, arbitrary: this.#shaped(schema, depth) },
      { weight: this.#wrongTypeWeight, arbitrary: anyValue },
    );
  }

  // Reads Zod's definition of the schema. Refinements don't change the
  // definition's type, so a refined schema gets the inputs of its base.
  #shaped(schema: Schema, depth: number): fc.Arbitrary<unknown> {
    const def = (schema as unknown as z.core.$ZodTypes)._zod.def;
    switch (def.type) {
      case "optional":
      case "default":
        return fc.oneof(fc.constant(undefined), this.input(def.innerType as Schema, depth));
      case "lazy":
        if (depth >= MAX_GENERATED_DEPTH) return anyValue;
        return fc.constant(null).chain(() => this.input(def.getter() as Schema, depth + 1));
      case "string":
        return this.#text;
      case "number":
        return anyNumber;
      case "boolean":
        return fc.boolean();
      case "null":
        return fc.constant(null);
      case "unknown":
        return anyValue;
      case "literal":
        return fc.constantFrom(...def.values);
      case "enum":
        return fc.constantFrom(...Object.values(def.entries));
      case "object":
        return this.#object(def.shape as Record<string, Schema>, depth);
      case "array":
        return fc.array(this.input(def.element as Schema, depth + 1), { maxLength: 3 });
      case "tuple":
        return this.#tuple(def.items as readonly Schema[], depth);
      case "record":
        return dictionary(
          this.#shaped(def.keyType as Schema, depth),
          this.input(def.valueType as Schema, depth + 1),
        );
      case "union":
        return fc.oneof(...def.options.map((option) => this.#shaped(option as Schema, depth)));
      case "intersection":
        return fc
          .tuple(this.#shaped(def.left as Schema, depth), this.#shaped(def.right as Schema, depth))
          .map(([left, right]) => mergeIfMaps(left, right));
      default:
        throw new Error(`No generator for a Zod "${def.type}" schema`);
    }
  }

  #object(shape: Record<string, Schema>, depth: number): fc.Arbitrary<unknown> {
    const entries = Object.entries(shape).map(([key, value]) =>
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

  #tuple(items: readonly Schema[], depth: number): fc.Arbitrary<unknown> {
    const exact = fc.tuple(...items.map((item) => this.input(item, depth + 1)));
    return fc.oneof(
      { weight: 100 - this.#wrongTypeWeight, arbitrary: exact },
      {
        weight: this.#wrongTypeWeight,
        arbitrary: fc.array(anyValue, { maxLength: items.length + 1 }),
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
