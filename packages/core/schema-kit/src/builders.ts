import {
  BooleanSchema,
  EnumSchema,
  LiteralSchema,
  type LiteralValue,
  NullSchema,
  UnknownSchema,
} from "./basic.ts";
import { ArraySchema, type KeySchema, RecordSchema, TupleSchema } from "./collections.ts";
import { NumberSchema } from "./number.ts";
import { ObjectSchema, type Shape } from "./object.ts";
import type { AnySchema } from "./schema.ts";
import { StringSchema } from "./string.ts";

/**
 * Builds schemas. Every schema is immutable: methods such as `.min()` and
 * `.optional()` return a new schema.
 *
 * @example
 * const Deployment = s.object({
 *   name: s.string().min(1),
 *   host: s.enum(["local", "cloudflare"]).default("local"),
 * }).strict();
 * type Deployment = Infer<typeof Deployment>;
 */
export const s = {
  /** Text. Add `.min()`, `.max()`, `.regex()`, `.email()` or `.url()`. */
  string: (): StringSchema => new StringSchema(),
  /** A finite number. Add `.min()`, `.max()`, `.positive()` or `.int()`. */
  number: (): NumberSchema => new NumberSchema(),
  /** `true` or `false`. */
  boolean: (): BooleanSchema => new BooleanSchema(),
  /** Only `null`. */
  null: (): NullSchema => new NullSchema(),
  /** Anything. In an object the key must still be there unless you add `.optional()`. */
  unknown: (): UnknownSchema => new UnknownSchema(),
  /** Exactly `value`, such as `s.literal(1)` or `s.literal("text")`. */
  literal: <const Value extends LiteralValue>(value: Value): LiteralSchema<Value> =>
    new LiteralSchema(value),
  /** One of a fixed list of texts, such as `s.enum(["low", "medium", "high"])`. */
  enum: <const Values extends readonly [string, ...string[]]>(values: Values): EnumSchema<Values> =>
    new EnumSchema(values),
  /** A map with these keys. Unknown keys are dropped; add `.strict()` to refuse or `.passthrough()` to keep them. */
  object: <S extends Shape>(shape: S): ObjectSchema<S> => new ObjectSchema(shape, "strip"),
  /** A list whose items all match `item`. Add `.min()` or `.max()` for its length. */
  array: <Item extends AnySchema>(item: Item): ArraySchema<Item> => new ArraySchema(item),
  /** A list with one schema per position, such as `s.tuple([s.unknown(), s.unknown()])`. */
  tuple: <const Items extends readonly [AnySchema, ...AnySchema[]]>(
    items: Items,
  ): TupleSchema<Items> => new TupleSchema(items),
  /** A map with any keys: every key matches `key` and every value matches `value`. */
  record: <Key extends KeySchema, Value extends AnySchema>(
    key: Key,
    value: Value,
  ): RecordSchema<Key, Value> => new RecordSchema(key, value),
};
