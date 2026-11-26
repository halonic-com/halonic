import { type Infer, s } from "@halonicjs/schema-kit";
import { inputNameSchema } from "./input-fields.ts";

/** The only OpenUI components a header's `ui` may use. */
export const uiComponents = ["card", "table", "form", "buttons"] as const;

const textSchema = (max: number) => s.string().min(1).max(max);

const cardSchema = s
  .object({
    component: s.literal("card"),
    title: textSchema(80).optional(),
    body: textSchema(300),
  })
  .strict();

const tableSchema = s
  .object({
    component: s.literal("table"),
    columns: s.array(textSchema(80)).min(1).max(8),
    rows: s
      .array(s.array(textSchema(200)).min(1).max(8))
      .min(1)
      .max(20),
  })
  .strict();

const formSchema = s
  .object({
    component: s.literal("form"),
    fields: s
      .array(
        s
          .object({
            input: inputNameSchema,
            label: textSchema(80).optional(),
            help: textSchema(200).optional(),
          })
          .strict(),
      )
      .min(1)
      .max(20),
  })
  .strict();

/** Only the confirm and cancel labels: a button carries no address, capability or action (S17). */
const buttonsSchema = s
  .object({
    component: s.literal("buttons"),
    confirm: textSchema(40),
    cancel: textSchema(40).optional(),
  })
  .strict();

const readOnlyComponents = s.array(s.discriminatedUnion("component", [cardSchema, tableSchema]));

/**
 * How the action looks and reads (HAL-17560, 4.2): `form` orders the inputs,
 * `preview` explains what will change (the capability's own preview lines are
 * always added after it), `confirm` is the sentence and buttons, `result` shows
 * what came back. A pure literal like the rest of the header.
 */
export const uiSchema = s
  .object({
    form: formSchema.optional(),
    preview: readOnlyComponents.max(5).optional(),
    confirm: s
      .object({ text: textSchema(200).optional(), buttons: buttonsSchema })
      .strict()
      .optional(),
    result: readOnlyComponents.max(5).optional(),
  })
  .strict();

/** The `ui` section of a header. */
export type HeaderUi = Infer<typeof uiSchema>;
