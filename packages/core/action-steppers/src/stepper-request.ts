import { type Infer, s } from "@halonicjs/schema-kit";

/** The format name of a stepper request document. */
export const stepperRequestFormat = "halonic.stepper-request/1";

/** The largest request document, in UTF-8 bytes, so a huge one can't stall Studio. */
export const maxStepperRequestBytes = 16 * 1024;

/** The most blocks a request may list. */
export const maxStepperBlocks = 20;

/** The most instruction lines a `browser` block may carry, and the longest line. */
export const maxBrowserInstructions = 10;
export const maxBrowserInstructionLength = 300;

/** A reviewed definition or step type by id and major version, such as `github.set-variable@1`. */
const referenceSchema = s
  .string()
  .max(100)
  .regex(
    /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+@[1-9][0-9]{0,3}$/,
    "must be an id and major version, such as github.set-variable@1",
  );

/** Parameter values: plain values only. Each definition's strict schema checks them again. */
const parametersSchema = s.record(
  s.string().max(64),
  s.union([s.string().max(1000), s.number(), s.boolean()]),
);

const referencedSchema = s
  .object({ ref: referenceSchema, parameters: parametersSchema.default({}) })
  .strict();

/** What the user pastes back from a `browser` block: never secret. */
const resultSchema = s
  .object({
    label: s.string().min(1).max(100),
    pattern: s
      .string()
      .min(3)
      .max(200)
      .regex(/^\^.*\$$/, "must start with ^ and end with $"),
  })
  .strict();

/**
 * One block of a stepper request: `use` a whole shipped definition, one
 * reviewed `step` type, or a `browser` page on an allow-listed origin with
 * the requester's own instructions (architecture note on HAL-17491, 7.1).
 * ToolScript's header `steps` reuses this schema (HAL-17560, section 6).
 */
export const stepperBlockSchema = s.discriminatedUnion("kind", [
  referencedSchema.extend({ kind: s.literal("use") }).strict(),
  referencedSchema.extend({ kind: s.literal("step") }).strict(),
  s
    .object({
      kind: s.literal("browser"),
      url: s.string().max(2000),
      instructions: s
        .array(s.string().min(1).max(maxBrowserInstructionLength))
        .min(1)
        .max(maxBrowserInstructions),
      result: resultSchema.optional(),
      check: referencedSchema.optional(),
    })
    .strict(),
]);

/** One block of a stepper request. */
export type StepperBlock = Infer<typeof stepperBlockSchema>;

/** A stepper request document in the format `halonic.stepper-request/1`. */
export const stepperRequestSchema = s
  .object({
    format: s.literal(stepperRequestFormat),
    title: s.string().min(1).max(200),
    reason: s.string().max(2000),
    blocks: s.array(stepperBlockSchema).min(1).max(maxStepperBlocks),
  })
  .strict();

/** A parsed stepper request. Its blocks still need `validateStepperRequest` against the catalog. */
export type StepperRequest = Infer<typeof stepperRequestSchema>;

/** Splits `github.set-variable@1` into its id and major version. The schema has already checked the shape. */
export function splitReference(reference: string): { id: string; version: number } {
  const at = reference.lastIndexOf("@");
  return { id: reference.slice(0, at), version: Number(reference.slice(at + 1)) };
}
