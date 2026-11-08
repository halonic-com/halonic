// Lists and maps: array, tuple and record.
import { describeValue, IssueCollector, type Path } from "./issue.ts";
import type { JsonSchema, JsonSchemaContext } from "./json-schema-context.ts";
import { isPlainMap, setOwnProperty } from "./own-property.ts";
import {
  type AnySchema,
  INVALID,
  type Infer,
  type InferInput,
  type Parsed,
  Schema,
  validValue,
} from "./schema.ts";

/** Accepts a list whose items all match one schema. Made by `s.array(item)`. */
export class ArraySchema<Item extends AnySchema> extends Schema<Infer<Item>[], InferInput<Item>[]> {
  /** The schema every item must match. */
  readonly item: Item;
  readonly #minItems: number | undefined;
  readonly #maxItems: number | undefined;

  constructor(item: Item, minItems?: number, maxItems?: number) {
    super();
    this.item = item;
    this.#minItems = minItems;
    this.#maxItems = maxItems;
  }

  /** At least `count` items. A second `.min()` keeps the stricter limit. */
  min(count: number): ArraySchema<Item> {
    return new ArraySchema(this.item, Math.max(this.#minItems ?? 0, count), this.#maxItems);
  }

  /** At most `count` items. A second `.max()` keeps the stricter limit. */
  max(count: number): ArraySchema<Item> {
    return new ArraySchema(this.item, this.#minItems, Math.min(this.#maxItems ?? count, count));
  }

  override check(input: unknown, path: Path, issues: IssueCollector): Parsed<Infer<Item>[]> {
    if (!Array.isArray(input)) {
      issues.reportFatal("invalid_type", path, `Expected a list, got ${describeValue(input)}`);
      return INVALID;
    }
    // A list over its maximum is refused before its items are read, so a
    // huge list costs nothing (Zod does the same).
    if (this.#maxItems !== undefined && input.length > this.#maxItems) {
      issues.reportHalt("too_big", path, `Expected at most ${items(this.#maxItems)}`);
      return INVALID;
    }
    const firstItemIssue = issues.count;
    const output: Infer<Item>[] = [];
    let valid = true;
    for (let index = 0; index < input.length; index++) {
      const parsed = this.item.check(input[index], [...path, index], issues);
      if (parsed.valid) output.push(parsed.value);
      else valid = false;
    }
    // The minimum is checked even when items failed, unless one of them halted.
    const tooShort = this.#minItems !== undefined && input.length < this.#minItems;
    if (tooShort && !issues.hasHaltSince(firstItemIssue)) {
      issues.report("too_small", path, `Expected at least ${items(this.#minItems ?? 0)}`);
    }
    return valid ? validValue(output) : INVALID;
  }

  override toJsonSchemaNode(context: JsonSchemaContext): JsonSchema {
    const node: JsonSchema = { type: "array", items: this.item.toJsonSchemaNode(context) };
    if (this.#minItems !== undefined) node["minItems"] = this.#minItems;
    if (this.#maxItems !== undefined) node["maxItems"] = this.#maxItems;
    return node;
  }
}

/** The parsed type of a tuple: one type per position. */
export type TupleOutput<Items extends readonly AnySchema[]> = {
  -readonly [K in keyof Items]: Infer<Items[K]>;
};

/** The accepted input of a tuple: one type per position. */
export type TupleInput<Items extends readonly AnySchema[]> = {
  -readonly [K in keyof Items]: InferInput<Items[K]>;
};

/**
 * Accepts a list with a fixed number of items, each with its own schema.
 * Optional schemas at the end may be left out. Made by `s.tuple([...])`.
 */
export class TupleSchema<Items extends readonly AnySchema[]> extends Schema<
  TupleOutput<Items>,
  TupleInput<Items>
> {
  /** The schema of each position. */
  readonly items: Items;

  constructor(items: Items) {
    super();
    this.items = items;
  }

  override check(input: unknown, path: Path, issues: IssueCollector): Parsed<TupleOutput<Items>> {
    if (!Array.isArray(input)) {
      issues.reportFatal("invalid_type", path, `Expected a list, got ${describeValue(input)}`);
      return INVALID;
    }
    const minimum = this.#requiredCount();
    if (input.length < minimum) {
      issues.reportFatal("too_small", path, `Expected at least ${items(minimum)}`);
      return INVALID;
    }
    let valid = true;
    if (input.length > this.items.length) {
      issues.reportFatal("too_big", path, `Expected at most ${items(this.items.length)}`);
      valid = false;
    }
    const output: unknown[] = [];
    for (const [index, schema] of this.items.entries()) {
      const parsed = schema.check(input[index], [...path, index], issues);
      if (!parsed.valid) valid = false;
      else if (index < input.length || parsed.value !== undefined) output[index] = parsed.value;
    }
    return valid ? validValue(output as TupleOutput<Items>) : INVALID;
  }

  override toJsonSchemaNode(context: JsonSchemaContext): JsonSchema {
    const prefixItems: JsonSchema[] = [];
    for (const schema of this.items) prefixItems.push(schema.toJsonSchemaNode(context));
    return {
      type: "array",
      prefixItems,
      items: false,
      minItems: this.#requiredCount(),
      maxItems: this.items.length,
    };
  }

  // Positions up to the last one that isn't optional must be there.
  #requiredCount(): number {
    for (let index = this.items.length - 1; index >= 0; index--) {
      if (this.items[index]?.whenMissing === "required") return index + 1;
    }
    return 0;
  }
}

/** A schema for record keys: it must accept text. */
export type KeySchema = Schema<string, unknown>;

/**
 * Accepts a map with any keys, where every key matches one schema and every
 * value another. A key named `__proto__` is skipped, as Zod did. Made by `s.record(key, value)`.
 */
export class RecordSchema<Key extends KeySchema, Value extends AnySchema> extends Schema<
  Record<Infer<Key>, Infer<Value>>,
  Record<Infer<Key>, InferInput<Value>>
> {
  /** The schema every key must match. */
  readonly key: Key;
  /** The schema every value must match. */
  readonly value: Value;

  constructor(key: Key, value: Value) {
    super();
    this.key = key;
    this.value = value;
  }

  override check(
    input: unknown,
    path: Path,
    issues: IssueCollector,
  ): Parsed<Record<Infer<Key>, Infer<Value>>> {
    if (!isPlainMap(input)) {
      issues.reportFatal("invalid_type", path, `Expected a map, got ${describeValue(input)}`);
      return INVALID;
    }
    const output: Record<string, unknown> = {};
    let valid = true;
    for (const key of Object.keys(input)) {
      if (key === "__proto__") continue;
      const keyPath = [...path, key];
      const parsedKey = this.#checkKey(key, keyPath, issues);
      if (parsedKey === undefined) {
        valid = false;
        continue;
      }
      const parsed = this.value.check(input[key], keyPath, issues);
      if (parsed.valid) setOwnProperty(output, parsedKey, parsed.value);
      else valid = false;
    }
    return valid ? validValue(output as Record<Infer<Key>, Infer<Value>>) : INVALID;
  }

  override toJsonSchemaNode(context: JsonSchemaContext): JsonSchema {
    return {
      type: "object",
      propertyNames: this.key.toJsonSchemaNode(context),
      additionalProperties: this.value.toJsonSchemaNode(context),
    };
  }

  // Any problem with a key makes it invalid, and its value isn't checked.
  #checkKey(key: string, keyPath: Path, issues: IssueCollector): string | undefined {
    const keyIssues = new IssueCollector();
    const parsed = this.key.check(key, keyPath, keyIssues);
    if (parsed.valid && keyIssues.isEmpty) return parsed.value;
    const reason = keyIssues.toIssues()[0]?.message ?? "Invalid key";
    issues.reportFatal("invalid_key", keyPath, `Invalid key "${key}": ${reason}`);
    return undefined;
  }
}

function items(count: number): string {
  return count === 1 ? "1 item" : `${count} items`;
}
