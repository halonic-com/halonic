import { type Infer, s } from "@halonicjs/schema-kit";
import { collectionId } from "../../shared/fields.ts";

/** The value types a collection field can hold. */
export const FIELD_TYPES = [
  "text",
  "number",
  "money",
  "date",
  "month",
  "choice",
  "boolean",
  "ref",
] as const;

const fieldName = s.string().regex(/^[a-zA-Z][a-zA-Z0-9_]*$/, "Field names: letters, digits and _");

/** One field of a collection's records. */
export const CollectionField = s
  .object({
    type: s.enum(FIELD_TYPES),
    description: s.string().optional(),
    required: s.boolean().default(false),
    /** choice: the allowed values. */
    values: s.array(s.string()).optional(),
    /** ref: the collection whose record ids the value holds. */
    collection: collectionId.optional(),
    min: s.number().optional(),
    max: s.number().optional(),
    default: s.unknown().optional(),
    /** Computed from other fields, such as "amount * sharePct / 100". Never set by an agent. */
    compute: s.string().optional(),
  })
  .strict()
  .superRefine((field, context) => {
    if (field.type === "choice" && !field.values?.length) {
      context.addIssue({ code: "custom", message: "A choice field needs values" });
    }
    if (field.type === "ref" && !field.collection) {
      context.addIssue({ code: "custom", message: "A ref field needs a collection" });
    }
  });

const scalar = () => s.union([s.string(), s.number(), s.boolean(), s.null()]);

/** A filter value: equal to, one of a list, null for empty, or a comparison. "today" is today's date. */
const WhereValue = s.union([
  s.string(),
  s.number(),
  s.boolean(),
  s.null(),
  s.array(scalar()),
  s
    .object({
      gt: s.unknown(),
      gte: s.unknown(),
      lt: s.unknown(),
      lte: s.unknown(),
      not: s.unknown(),
    })
    .partial()
    .strict(),
]);

/** A named, filtered list of records, with an optional total. */
export const CollectionView = s
  .object({
    description: s.string().optional(),
    where: s.record(s.string(), WhereValue).default({}),
    /** A number or money field summed over the view. */
    total: s.string().optional(),
    sort: s.string().optional(),
  })
  .strict();

/**
 * `library/collections/<id>.collection.yaml`: a typed list of records agents
 * read and write. The file defines it; the records are runtime data.
 */
export const Collection = s
  .object({
    version: s.literal(1).default(1),
    id: collectionId,
    name: s.string().min(1),
    description: s.string().optional(),
    /** Requirement ids this collection serves. */
    implements: s.array(s.string()).default([]),
    fields: s
      .record(fieldName, CollectionField)
      .refine((fields) => Object.keys(fields).length > 0, "A collection needs fields"),
    views: s.record(s.string(), CollectionView).default({}),
    /** Records added once when no record with their id exists yet. */
    seed: s
      .array(s.record(s.string(), s.unknown()).and(s.object({ id: s.string().min(1) })))
      .default([]),
  })
  .strict();

/** A collection definition, with defaults filled in. */
export type Collection = Infer<typeof Collection>;
/** One field of a collection. */
export type CollectionField = Infer<typeof CollectionField>;
/** A named view of a collection. */
export type CollectionView = Infer<typeof CollectionView>;
