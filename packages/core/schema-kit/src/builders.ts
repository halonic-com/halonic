import { z } from "zod";

/**
 * Builds schemas. These are Zod's own builders, limited to the ones the file
 * format uses, so the rest of the code never imports Zod. The
 * schemas they return have Zod's methods, such as `.min()`, `.optional()`,
 * `.default()`, `.strict()`, `.extend()` and `.superRefine()`.
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
  string: z.string,
  /** A finite number. Add `.min()`, `.max()`, `.positive()` or `.int()`. */
  number: z.number,
  /** `true` or `false`. */
  boolean: z.boolean,
  /** Only `null`. */
  null: z.null,
  /** Anything. In an object the key must still be there unless you add `.optional()`. */
  unknown: z.unknown,
  /** Exactly one value, such as `s.literal(1)` or `s.literal("text")`. */
  literal: z.literal,
  /** One of a fixed list of texts, such as `s.enum(["low", "medium", "high"])`. */
  enum: z.enum,
  /** A map with these keys. Unknown keys are dropped; add `.strict()` to refuse or `.passthrough()` to keep them. */
  object: z.object,
  /** A list whose items all match one schema. Add `.min()` or `.max()` for its length. */
  array: z.array,
  /** A list with one schema per position. */
  tuple: z.tuple,
  /** A map with any keys: every key matches the key schema and every value the value schema. */
  record: z.record,
  /** A value that matches any of the options. */
  union: z.union,
  /** A map whose value at one key picks one of the object schemas. */
  discriminatedUnion: z.discriminatedUnion,
  /** A value that matches both schemas; maps are merged. */
  intersection: z.intersection,
  /** A schema that refers to itself. */
  lazy: z.lazy,
} as const;
