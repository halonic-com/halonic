// Random schemas built from every combinator, described once as a tree.
// schema-tree-build.ts builds each tree twice, with Zod and with schema-kit,
// and the differential test feeds both the same inputs.
import fc from "fast-check";
import type { LiteralValue } from "../index.ts";

type Entries = readonly (readonly [string, SchemaNode])[];
/** What an object node does with unknown keys. */
export type ObjectMode = "strip" | "strict" | "passthrough";
/** A string check a node can carry. */
export type StringCheck =
  | "min1"
  | "max3"
  | "lowercase"
  | "startsWithA"
  | "digitGlobal"
  | "email"
  | "url";
/** A number check a node can carry. */
export type NumberCheck = "min0" | "max10" | "positive" | "int";

/** One combinator and its children. */
export type SchemaNode =
  | { readonly kind: "string"; readonly checks: readonly StringCheck[] }
  | { readonly kind: "number"; readonly checks: readonly NumberCheck[] }
  | { readonly kind: "boolean" | "null" | "unknown" }
  | { readonly kind: "literal"; readonly value: LiteralValue }
  | { readonly kind: "enum"; readonly values: readonly [string, ...string[]] }
  | ObjectNode
  | {
      readonly kind: "array";
      readonly item: SchemaNode;
      readonly min: number | null;
      readonly max: number | null;
    }
  | { readonly kind: "tuple"; readonly items: readonly [SchemaNode, ...SchemaNode[]] }
  | { readonly kind: "record"; readonly key: "any" | "min2"; readonly value: SchemaNode }
  | { readonly kind: "union"; readonly options: readonly [SchemaNode, ...SchemaNode[]] }
  | { readonly kind: "discriminated"; readonly options: readonly ObjectNode[] }
  | { readonly kind: "intersection"; readonly left: SchemaNode; readonly right: ObjectNode }
  | { readonly kind: "optional" | "refine"; readonly inner: SchemaNode }
  | { readonly kind: "default"; readonly inner: SchemaNode; readonly value: unknown };

/** An object node: its keys, unknown-key mode, and whether .partial() or .extend() apply. */
export interface ObjectNode {
  readonly kind: "object";
  readonly entries: Entries;
  readonly mode: ObjectMode;
  readonly partial: boolean;
  readonly extend: Entries;
}

const KEYS = ["a", "b", "c", "type"] as const;
/** The patterns the regex checks use. */
export const PATTERNS = { lowercase: /^[a-z]+$/, startsWithA: /^a/, digitGlobal: /\d/g } as const;

const stringChecks: readonly StringCheck[] = [
  "min1",
  "max3",
  "lowercase",
  "startsWithA",
  "digitGlobal",
  "email",
  "url",
];
const numberChecks: readonly NumberCheck[] = ["min0", "max10", "positive", "int"];

/** A random schema tree. */
export const schemaNode: fc.Arbitrary<SchemaNode> = fc.letrec<{
  node: SchemaNode;
  object: ObjectNode;
}>((tie) => {
  const node = tie("node");
  const entries = fc.uniqueArray(fc.tuple(fc.constantFrom(...KEYS), node), {
    maxLength: 3,
    selector: ([key]) => key,
  });
  const leaf = fc.oneof(
    fc.record({ kind: fc.constant("string" as const), checks: fc.subarray([...stringChecks]) }),
    fc.record({
      kind: fc.constant("number" as const),
      checks: fc.shuffledSubarray([...numberChecks]),
    }),
    fc.record({ kind: fc.constantFrom("boolean" as const, "null" as const, "unknown" as const) }),
    fc.record({
      kind: fc.constant("literal" as const),
      value: fc.constantFrom<LiteralValue>("a", 1, true, null),
    }),
    fc.record({
      kind: fc.constant("enum" as const),
      values: fc.constantFrom(["a"] as const, ["a", "abc", "text"] as const),
    }),
  );
  const object = fc.record({
    kind: fc.constant("object" as const),
    entries,
    mode: fc.constantFrom<ObjectMode>("strip", "strict", "passthrough"),
    partial: fc.boolean(),
    extend: fc.oneof({ weight: 3, arbitrary: fc.constant([]) }, { weight: 1, arbitrary: entries }),
  });
  return {
    object,
    node: fc.oneof(
      { depthSize: "small", withCrossShrink: true },
      { weight: 6, arbitrary: leaf },
      { weight: 2, arbitrary: tie("object") },
      fc.record({
        kind: fc.constant("array" as const),
        item: node,
        min: fc.constantFrom(null, 1, 2),
        max: fc.constantFrom(null, 2),
      }),
      fc.record({ kind: fc.constant("tuple" as const), items: fc.tuple(node, node) }),
      fc.record({
        kind: fc.constant("record" as const),
        key: fc.constantFrom("any" as const, "min2" as const),
        value: node,
      }),
      fc.record({ kind: fc.constant("union" as const), options: fc.tuple(node, node) }),
      fc.record({
        kind: fc.constant("discriminated" as const),
        options: fc.constant(null).chain(() => discriminatedOptions(object)),
      }),
      fc.record({
        kind: fc.constant("intersection" as const),
        left: openSide(node),
        right: openObject(object),
      }),
      fc.record({ kind: fc.constantFrom("optional" as const, "refine" as const), inner: node }),
      fc.record({
        kind: fc.constant("default" as const),
        inner: node,
        value: fc.constantFrom("abc", 1, true, null, [], {}),
      }),
    ),
  };
}).node;

// Every option gets a different "type" value, as a discriminated union needs.
function discriminatedOptions(object: fc.Arbitrary<ObjectNode>): fc.Arbitrary<ObjectNode[]> {
  return fc.array(object, { minLength: 1, maxLength: 3 }).map((options) =>
    options.map((option, index) => ({
      ...option,
      partial: false,
      entries: [
        ["type", { kind: "literal", value: `t${index}` }] as const,
        ...option.entries.filter(([key]) => key !== "type"),
      ],
      extend: option.extend.filter(([key]) => key !== "type"),
    })),
  );
}

// Strict objects inside intersections are a known difference (Zod lets the
// other side accept a key), so intersections only get open objects and records.
function openObject(object: fc.Arbitrary<ObjectNode>): fc.Arbitrary<ObjectNode> {
  return object.map((option) => ({
    ...option,
    mode: option.mode === "strict" ? "strip" : option.mode,
  }));
}

function openSide(node: fc.Arbitrary<SchemaNode>): fc.Arbitrary<SchemaNode> {
  return fc.oneof(
    fc.record({
      kind: fc.constant("record" as const),
      key: fc.constant("any" as const),
      value: node,
    }),
    fc.record({
      kind: fc.constant("object" as const),
      entries: fc.constant([]),
      mode: fc.constant("passthrough" as const),
      partial: fc.constant(false),
      extend: fc.constant([]),
    }),
  );
}
