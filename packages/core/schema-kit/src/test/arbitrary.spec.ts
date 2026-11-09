// Generates inputs for a schema: mostly close to valid, so the checks deep
// inside get exercised, with wrong types, missing and extra keys, edge
// values and odd Unicode mixed in.
import fc from "fast-check";
import { z } from "zod";
import type { Schema } from "../index.ts";

/** How deep recursive schemas go before only leaves are generated. */
const MAX_GENERATED_DEPTH = 6;

/** Texts that hit the patterns, formats and lengths in the old schemas. */
const INTERESTING_TEXTS = [
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
];

const interestingTexts = fc.constantFrom(...INTERESTING_TEXTS);

const anyText = fc.oneof(
  { weight: 3, arbitrary: interestingTexts },
  { weight: 1, arbitrary: fc.string({ maxLength: 12 }) },
  { weight: 1, arbitrary: fc.string({ unit: "binary", maxLength: 6 }) },
);

/** Numbers at the edges of the ranges in the old schemas. */
const INTERESTING_NUMBERS = [
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
];

const anyNumber = fc.oneof(
  fc.constantFrom(...INTERESTING_NUMBERS),
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
 * Its noise is spread over the whole document: one input in four gets a
 * single fault somewhere, the rest are valid.
 */
export type Noise = "high" | "low";

/** An input for `schema`. */
export function inputFor(schema: Schema, noise: Noise = "high"): fc.Arbitrary<unknown> {
  if (noise === "high") return new InputGenerator().input(schema, 0);
  const valid = new ValidInputGenerator("full").input(schema, 0);
  return fc.oneof({ weight: 3, arbitrary: valid }, { weight: 1, arbitrary: withOneFault(valid) });
}

/** Mostly well-shaped inputs with wrong types and missing or extra keys at every level. */
class InputGenerator {
  readonly #wrongTypeWeight = 10;
  readonly #missingKeyWeight = 10;
  readonly #text = anyText;

  input(schema: Schema, depth: number): fc.Arbitrary<unknown> {
    return fc.oneof(
      { weight: 100 - this.#wrongTypeWeight, arbitrary: this.#shaped(schema, depth) },
      { weight: this.#wrongTypeWeight, arbitrary: anyValue },
    );
  }

  #shaped(schema: Schema, depth: number): fc.Arbitrary<unknown> {
    const def = definitionOf(schema);
    switch (def.type) {
      case "optional":
      case "default":
        return fc.oneof(fc.constant(undefined), this.input(def.innerType as Schema, depth));
      // The depth limit ends the recursion, so the generator is built once
      // here. Building it again for every sample made Guard the slowest case.
      case "lazy":
        if (depth >= MAX_GENERATED_DEPTH) return anyValue;
        return this.input(def.getter() as Schema, depth + 1);
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

/**
 * "full" builds whole documents. "leaves" closes a recursion: it takes the
 * first option of every union and leaves lists, maps and optional keys out.
 */
type Reach = "full" | "leaves";

/**
 * Inputs that pass the schema: every required key is there, strict objects
 * get no unknown keys, and texts and numbers meet the schema's checks.
 * Refinements written as functions are not read, so an input of a refined
 * map or object may still fail.
 */
class ValidInputGenerator {
  readonly #reach: Reach;
  #leaves: ValidInputGenerator | undefined;

  constructor(reach: Reach) {
    this.#reach = reach;
  }

  input(schema: Schema, depth: number): fc.Arbitrary<unknown> {
    const def = definitionOf(schema);
    switch (def.type) {
      case "optional":
      case "default":
        if (this.#reach === "leaves") return fc.constant(undefined);
        return fc.oneof(fc.constant(undefined), this.input(def.innerType as Schema, depth));
      // Past the depth limit, a recursive schema is closed with leaves.
      case "lazy":
        if (depth >= MAX_GENERATED_DEPTH) {
          return this.#leavesGenerator().input(def.getter() as Schema, depth + 1);
        }
        return this.input(def.getter() as Schema, depth + 1);
      case "string":
        return passingCandidates(schema, INTERESTING_TEXTS);
      case "number":
        return this.#number(schema, def);
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
        return this.#object(def, depth);
      case "array":
        return this.#array(def, depth);
      case "tuple":
        return fc.tuple(...def.items.map((item) => this.input(item as Schema, depth + 1)));
      case "record":
        if (this.#reach === "leaves") return fc.constant({});
        return dictionary(
          this.input(def.keyType as Schema, depth),
          this.input(def.valueType as Schema, depth + 1),
        );
      case "union":
        if (this.#reach === "leaves") return this.input(def.options[0] as Schema, depth);
        return fc.oneof(...def.options.map((option) => this.input(option as Schema, depth)));
      case "intersection":
        return fc
          .tuple(this.input(def.left as Schema, depth), this.input(def.right as Schema, depth))
          .map(([left, right]) => mergeIfMaps(left, right));
      default:
        throw new Error(`No generator for a Zod "${def.type}" schema`);
    }
  }

  // The leaves generator calls itself on recursion, so a recursive schema
  // must have a first union option that doesn't recurse, as Guard does.
  #leavesGenerator(): ValidInputGenerator {
    if (this.#reach === "leaves") return this;
    this.#leaves ??= new ValidInputGenerator("leaves");
    return this.#leaves;
  }

  // A plain number takes any finite number; a checked one only the
  // interesting numbers that pass, since random ones rarely would.
  #number(schema: Schema, def: z.core.$ZodNumberDef): fc.Arbitrary<number> {
    const interesting = passingCandidates(schema, INTERESTING_NUMBERS);
    if (def.checks?.length) return interesting;
    return fc.oneof(
      interesting,
      fc.integer({ min: -1000, max: 1000 }),
      fc.double({ noNaN: true, noDefaultInfinity: true }),
    );
  }

  // An optional key is sometimes left out, sometimes set to undefined:
  // Zod treats the two differently in the parsed value.
  #object(def: z.core.$ZodObjectDef, depth: number): fc.Arbitrary<unknown> {
    const entries = Object.entries(def.shape).map(([key, value]) => {
      const generated = this.input(value as Schema, depth + 1);
      const mayBeLeftOut = isOptional(value as Schema) && this.#reach === "full";
      return (mayBeLeftOut ? fc.oneof(fc.constant(OMITTED), generated) : generated).map(
        (entry) => [key, entry] as const,
      );
    });
    // Objects that aren't strict strip unknown keys, which is worth comparing.
    const stripsUnknownKeys = def.catchall === undefined && this.#reach === "full";
    const extra = stripsUnknownKeys
      ? fc.oneof(
          { weight: 4, arbitrary: fc.constant({}) },
          { weight: 1, arbitrary: dictionary(anyText, anyValue) },
        )
      : fc.constant({});
    return fc.tuple(fc.tuple(...entries), extra).map(([knownEntries, extraValues]) => {
      const known: Record<string, unknown> = {};
      for (const [key, generated] of knownEntries) {
        if (generated !== OMITTED) known[key] = generated;
      }
      return mergeIfMaps(extraValues, known);
    });
  }

  #array(def: z.core.$ZodArrayDef, depth: number): fc.Arbitrary<unknown> {
    const minLength = minimumLength(def);
    const maxLength = this.#reach === "leaves" ? minLength : Math.max(minLength, 3);
    return fc.array(this.input(def.element as Schema, depth + 1), { minLength, maxLength });
  }
}

/** A fault put into a valid document. */
type Fault = "wrong type" | "missing key" | "extra key";

/**
 * Puts one fault into each document, at a place picked at random: a value of
 * the wrong type, a key left out or an unknown key added. Some faults still
 * pass, such as a left-out optional key.
 */
function withOneFault(documents: fc.Arbitrary<unknown>): fc.Arbitrary<unknown> {
  return fc
    .record({
      document: documents,
      fault: fc.constantFrom<Fault>("wrong type", "missing key", "extra key"),
      place: fc.nat(),
      key: anyText,
      value: anyValue,
    })
    .map(({ document, fault, place, key, value }) => {
      const pick = (paths: readonly Path[]) => paths[place % paths.length];
      const places = placesIn(document);
      if (fault === "wrong type") return replaceAt(document, pick(places) ?? [], value);
      if (fault === "missing key") {
        // The document itself has no key to leave out, so the root is never picked.
        const keyPlaces = places.filter(
          (path) => path.length > 0 && isMap(valueAt(document, path.slice(0, -1))),
        );
        const path = pick(keyPlaces);
        return path === undefined ? document : replaceAt(document, path, OMITTED);
      }
      const mapPlaces = places.filter((path) => isMap(valueAt(document, path)));
      const path = pick(mapPlaces);
      return path === undefined ? document : replaceAt(document, [...path, key], value);
    });
}

/** Where a value sits in a document: the keys or list indexes leading to it. */
type Path = readonly string[];

/** Every place in `document`, the document itself first. */
function placesIn(document: unknown, path: Path = []): Path[] {
  const places: Path[] = [path];
  if (typeof document === "object" && document !== null) {
    for (const [key, value] of Object.entries(document)) {
      places.push(...placesIn(value, [...path, key]));
    }
  }
  return places;
}

function valueAt(document: unknown, path: Path): unknown {
  let value = document;
  for (const key of path) value = (value as Record<string, unknown>)[key];
  return value;
}

/**
 * A copy of `document` with `replacement` at `path`, or the key at `path`
 * left out for OMITTED. Generated documents may be reused, so they are
 * never changed in place.
 */
function replaceAt(document: unknown, path: Path, replacement: unknown): unknown {
  const [key, ...rest] = path;
  if (key === undefined) return replacement;
  const parent = document as Record<string, unknown>;
  const changed = replaceAt(parent[key], rest, replacement);
  if (Array.isArray(parent)) {
    return parent.map((item, index) => (String(index) === key ? changed : item));
  }
  const copy: Record<string, unknown> = {};
  for (const [entryKey, entryValue] of Object.entries(parent)) {
    if (entryKey !== key) defineEntry(copy, entryKey, entryValue);
  }
  if (changed !== OMITTED) defineEntry(copy, key, changed);
  return copy;
}

const OMITTED = Symbol("omitted");

// Reads Zod's definition of the schema. Refinements don't change the
// definition's type, so a refined schema gets the inputs of its base.
function definitionOf(schema: Schema): z.core.$ZodTypes["_zod"]["def"] {
  return (schema as unknown as z.core.$ZodTypes)._zod.def;
}

function isOptional(schema: Schema): boolean {
  const type = definitionOf(schema).type;
  return type === "optional" || type === "default";
}

/** The candidates `schema` accepts, to pick from. */
function passingCandidates<T>(schema: Schema, candidates: readonly T[]): fc.Arbitrary<T> {
  const passing = candidates.filter(
    (candidate) => z.safeParse(schema as unknown as z.ZodType, candidate).success,
  );
  if (passing.length === 0) {
    const type = definitionOf(schema).type;
    throw new Error(`No interesting value passes a Zod "${type}" schema's checks; add one`);
  }
  return fc.constantFrom(...passing);
}

/** The length a list schema asks for at least, from its `.min()` check. */
function minimumLength(def: z.core.$ZodArrayDef): number {
  for (const check of def.checks ?? []) {
    const checkDef = check._zod.def as Partial<z.core.$ZodCheckMinLengthDef>;
    if (checkDef.check === "min_length" && checkDef.minimum !== undefined) {
      return checkDef.minimum;
    }
  }
  return 0;
}

// fc.dictionary would assign keys with `=`, which turns "__proto__" into a prototype change.
function dictionary(
  key: fc.Arbitrary<unknown>,
  value: fc.Arbitrary<unknown>,
): fc.Arbitrary<Record<string, unknown>> {
  return fc.array(fc.tuple(key, value), { maxLength: 3 }).map((entries) => {
    const map: Record<string, unknown> = {};
    for (const [entryKey, entryValue] of entries) defineEntry(map, String(entryKey), entryValue);
    return map;
  });
}

function mergeIfMaps(left: unknown, right: unknown): unknown {
  if (!isMap(left) || !isMap(right)) return right;
  const merged: Record<string, unknown> = {};
  for (const source of [left, right]) {
    for (const [key, value] of Object.entries(source)) defineEntry(merged, key, value);
  }
  return merged;
}

function isMap(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Assigning with `=` would turn "__proto__" into a prototype change.
function defineEntry(map: Record<string, unknown>, key: string, value: unknown): void {
  Object.defineProperty(map, key, { value, enumerable: true, writable: true, configurable: true });
}
