import { type Infer, s } from "@halonicjs/schema-kit";

/** The name of an input, as written in `{input.name}`. */
export const inputNameSchema = s.string().regex(/^[a-z][A-Za-z0-9]{0,39}$/, "must be camelCase");

/** An anchored pattern the whole value must match, so no text input is free text. */
const patternSchema = s
  .string()
  .min(3)
  .max(200)
  .regex(/^\^.*\$$/, "must start with ^ and end with $")
  .refine((pattern) => {
    try {
      new RegExp(pattern);
      return true;
    } catch {
      return false;
    }
  }, "must be a valid regular expression");

const textSchema = (max: number) => s.string().min(1).max(max);

const stringItem = s.object({ type: s.literal("string"), pattern: patternSchema }).strict();
const integerItem = s
  .object({
    type: s.literal("integer"),
    min: s.number().int().optional(),
    max: s.number().int().optional(),
  })
  .strict();
const enumItem = s
  .object({ type: s.literal("enum"), values: s.array(textSchema(100)).min(1).max(50) })
  .strict();

const labelled = { description: textSchema(200), optional: s.boolean().optional() };

/**
 * One input of a ToolScript: a string that matches a pattern, an integer, a
 * boolean, one of a fixed list of values, or a list of those. `secret` is only
 * for a string, and only a `user` header may have one.
 */
export const inputFieldSchema = s.discriminatedUnion("type", [
  stringItem.extend({ ...labelled, secret: s.boolean().optional() }).strict(),
  integerItem.extend(labelled).strict(),
  s.object({ type: s.literal("boolean"), ...labelled }).strict(),
  enumItem.extend(labelled).strict(),
  s
    .object({
      type: s.literal("list"),
      items: s.discriminatedUnion("type", [stringItem, integerItem, enumItem]),
      max: s.number().int().min(1).max(100).optional(),
      ...labelled,
    })
    .strict(),
]);

/** One declared input of a ToolScript. */
export type InputField = Infer<typeof inputFieldSchema>;
