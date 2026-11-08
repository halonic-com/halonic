// Builds a random schema tree (schema-tree.ts) with Zod and with schema-kit.
import { type ZodType, z } from "zod";
import { type AnySchema, type ObjectSchema, s } from "../index.ts";
import {
  type NumberCheck,
  type ObjectMode,
  type ObjectNode,
  PATTERNS,
  type SchemaNode,
  type StringCheck,
} from "./schema-tree.ts";

/** The same refinement for both libraries: the value's JSON has an even length. */
function evenJson(value: unknown): boolean {
  return (JSON.stringify(value ?? null) ?? "").length % 2 === 0;
}

/** Builds the tree with Zod. */
export function buildZod(node: SchemaNode): ZodType {
  switch (node.kind) {
    case "string":
      return node.checks.reduce<z.ZodString>(
        (schema, check) => zodStringCheck(schema, check),
        z.string(),
      );
    case "number":
      return node.checks.reduce<z.ZodNumber>(
        (schema, check) => zodNumberCheck(schema, check),
        z.number(),
      );
    case "boolean":
      return z.boolean();
    case "null":
      return z.null();
    case "unknown":
      return z.unknown();
    case "literal":
      return z.literal(node.value);
    case "enum":
      return z.enum(node.values);
    case "object":
      return buildZodObject(node);
    case "array": {
      let schema = z.array(buildZod(node.item));
      if (node.min !== null) schema = schema.min(node.min);
      if (node.max !== null) schema = schema.max(node.max);
      return schema;
    }
    case "tuple":
      return z.tuple([buildZod(node.items[0]), ...node.items.slice(1).map(buildZod)]);
    case "record":
      return z.record(node.key === "any" ? z.string() : z.string().min(2), buildZod(node.value));
    case "union":
      return z.union(node.options.map(buildZod));
    case "discriminated":
      return z.discriminatedUnion(
        "type",
        node.options.map(buildZodObject) as [z.ZodObject, ...z.ZodObject[]],
      );
    case "intersection":
      return buildZod(node.left).and(buildZodObject(node.right));
    case "optional":
      return buildZod(node.inner).optional();
    case "refine":
      return buildZod(node.inner).refine(evenJson);
    case "default":
      return buildZod(node.inner).default(node.value);
  }
}

function buildZodObject(node: ObjectNode): z.ZodObject {
  let schema = z.object(
    Object.fromEntries(node.entries.map(([key, child]) => [key, buildZod(child)])),
  );
  if (node.mode === "strict") schema = schema.strict();
  if (node.mode === "passthrough") schema = schema.passthrough();
  if (node.extend.length > 0)
    schema = schema.extend(
      Object.fromEntries(node.extend.map(([key, child]) => [key, buildZod(child)])),
    );
  return node.partial ? schema.partial() : schema;
}

function zodStringCheck(schema: z.ZodString, check: StringCheck): z.ZodString {
  if (check === "min1") return schema.min(1);
  if (check === "max3") return schema.max(3);
  if (check === "email") return schema.email();
  if (check === "url") return schema.url();
  return schema.regex(PATTERNS[check]);
}

function zodNumberCheck(schema: z.ZodNumber, check: NumberCheck): z.ZodNumber {
  if (check === "min0") return schema.min(0);
  if (check === "max10") return schema.max(10);
  if (check === "positive") return schema.positive();
  return schema.int();
}

/** Builds the tree with schema-kit. */
export function buildKit(node: SchemaNode): AnySchema {
  switch (node.kind) {
    case "string":
      return node.checks.reduce((schema, check) => kitStringCheck(schema, check), s.string());
    case "number":
      return node.checks.reduce((schema, check) => kitNumberCheck(schema, check), s.number());
    case "boolean":
      return s.boolean();
    case "null":
      return s.null();
    case "unknown":
      return s.unknown();
    case "literal":
      return s.literal(node.value);
    case "enum":
      return s.enum(node.values);
    case "object":
      return buildKitObject(node);
    case "array": {
      let schema = s.array(buildKit(node.item));
      if (node.min !== null) schema = schema.min(node.min);
      if (node.max !== null) schema = schema.max(node.max);
      return schema;
    }
    case "tuple":
      return s.tuple([buildKit(node.items[0]), ...node.items.slice(1).map(buildKit)]);
    case "record":
      return s.record(node.key === "any" ? s.string() : s.string().min(2), buildKit(node.value));
    case "union":
      return s.union([buildKit(node.options[0]), ...node.options.slice(1).map(buildKit)]);
    case "discriminated": {
      const [first, ...rest] = node.options.map(buildKitObject);
      if (first === undefined) throw new Error("a discriminated union needs an option");
      return s.discriminatedUnion("type", [first, ...rest]);
    }
    case "intersection":
      return s.intersection(buildKit(node.left), buildKitObject(node.right));
    case "optional":
      return asSchema(buildKit(node.inner)).optional();
    case "refine":
      return asSchema(buildKit(node.inner)).refine(evenJson, "odd JSON length");
    case "default":
      return asSchema(buildKit(node.inner)).default(node.value);
  }
}

function buildKitObject(node: ObjectNode): ObjectSchema<Record<string, AnySchema>, ObjectMode> {
  let schema: ObjectSchema<Record<string, AnySchema>, ObjectMode> = s.object(
    Object.fromEntries(node.entries.map(([key, child]) => [key, buildKit(child)])),
  );
  if (node.mode === "strict") schema = schema.strict();
  if (node.mode === "passthrough") schema = schema.passthrough();
  if (node.extend.length > 0)
    schema = schema.extend(
      Object.fromEntries(node.extend.map(([key, child]) => [key, buildKit(child)])),
    );
  return node.partial ? schema.partial() : schema;
}

function kitStringCheck(
  schema: ReturnType<typeof s.string>,
  check: StringCheck,
): ReturnType<typeof s.string> {
  if (check === "min1") return schema.min(1);
  if (check === "max3") return schema.max(3);
  if (check === "email") return schema.email();
  if (check === "url") return schema.url();
  return schema.regex(PATTERNS[check]);
}

function kitNumberCheck(
  schema: ReturnType<typeof s.number>,
  check: NumberCheck,
): ReturnType<typeof s.number> {
  if (check === "min0") return schema.min(0);
  if (check === "max10") return schema.max(10);
  if (check === "positive") return schema.positive();
  return schema.int();
}

// The trees are built dynamically, so the schema's static type is unknown here.
function asSchema(schema: AnySchema): ReturnType<typeof s.unknown> {
  return schema as ReturnType<typeof s.unknown>;
}
