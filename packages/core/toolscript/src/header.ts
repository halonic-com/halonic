import { stepperBlockSchema } from "@halonicjs/action-steppers";
import { type Infer, s } from "@halonicjs/schema-kit";
import {
  capabilityReferenceSchema,
  exampleSchema,
  guideSchema,
  limitsSchema,
  toolSchema,
  toolscriptRisks,
  touchesSchema,
} from "./header-parts.ts";
import { checkHeaderReferences } from "./header-references.ts";
import { inputFieldSchema, inputNameSchema } from "./input-fields.ts";
import { uiSchema } from "./ui.ts";

/** The format name of a ToolScript header. */
export const toolscriptFormat = "halonic.toolscript/1";

/** The most blocks a declarative ToolScript may list, the same as a stepper request. */
const maxSteps = 20;

/**
 * The header of a ToolScript, a pure literal in `<name>.tool.ts` (HAL-17560,
 * section 4). Strict: an unknown key is refused. Checks that need the
 * capability registry or the script's code are in `checkHeader`.
 */
export const headerSchema = s
  .object({
    format: s.literal(toolscriptFormat),
    id: s
      .string()
      .max(100)
      .regex(/^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/, "must be <namespace>.<name>, lower case"),
    version: s.number().int().min(1).max(9999),
    audience: s.enum(["user", "agent"]),
    title: s.string().min(1).max(80),
    summary: s.string().min(1).max(300),
    risk: s.enum(toolscriptRisks),
    inputs: s.record(inputNameSchema, inputFieldSchema),
    outputs: s.record(inputNameSchema, inputFieldSchema).optional(),
    uses: s.array(capabilityReferenceSchema).max(50),
    touches: touchesSchema.optional(),
    steps: s.array(stepperBlockSchema).min(1).max(maxSteps).optional(),
    guide: guideSchema.optional(),
    ui: uiSchema.optional(),
    examples: s.array(exampleSchema).max(10).optional(),
    limits: limitsSchema.optional(),
    tool: toolSchema.optional(),
  })
  .strict()
  .superRefine((header, context) => {
    for (const problem of checkHeaderReferences(header)) {
      context.addIssue({ code: "custom", path: problem.path, message: problem.message });
    }
  });

/** A checked ToolScript header. */
export type Header = Infer<typeof headerSchema>;
