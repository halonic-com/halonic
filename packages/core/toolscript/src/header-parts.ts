import { s } from "@halonicjs/schema-kit";
import { inputNameSchema } from "./input-fields.ts";

/** A reviewed capability by id and major version, such as `github.set-variable@1`. */
export const capabilityReferenceSchema = s
  .string()
  .max(100)
  .regex(
    /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+@[1-9][0-9]{0,3}$/,
    "must be an id and major version, such as github.set-variable@1",
  );

/** The risk of a ToolScript, lowest first. */
export const toolscriptRisks = ["routine", "admin", "irreversible"] as const;

/** The most `ctx` calls an agent tool may make (HAL-17560, 2.3). A user script may make 100. */
export const maxAgentCalls = 50;

/** Limits a header may only lower, never raise (HAL-17560, 2.3). */
export const limitsSchema = s
  .object({
    memoryMb: s.number().int().min(1).max(32).optional(),
    stackKb: s.number().int().min(1).max(256).optional(),
    cpuMs: s.number().int().min(1).max(2000).optional(),
    calls: s.number().int().min(1).max(100).optional(),
    outputKb: s.number().int().min(1).max(64).optional(),
    pendingPromises: s.number().int().min(1).max(32).optional(),
  })
  .strict();

/** The short tool name and description the model sees. For an `agent` header only. */
export const toolSchema = s
  .object({
    name: s.string().regex(/^[a-z][a-z0-9_]{0,39}$/, "must be snake_case"),
    description: s.string().min(1).max(500),
  })
  .strict();

/** Extra wording for the manual guide, by capability or block index. */
export const guideSchema = s
  .object({
    intro: s.string().min(1).max(1000).optional(),
    perStep: s.record(s.string().max(100), s.string().min(1).max(500)).optional(),
  })
  .strict();

/** A named input set with the calls the script is expected to make, for dry runs and fixtures. */
export const exampleSchema = s
  .object({
    name: s.string().min(1).max(80),
    input: s.record(inputNameSchema, s.json()),
    calls: s
      .array(
        s
          .object({
            capability: capabilityReferenceSchema,
            arguments: s.record(s.string().max(64), s.json()),
          })
          .strict(),
      )
      .max(100),
  })
  .strict();

/**
 * The write targets a capability may touch, built from inputs only, such as
 * `{ repo: "{input.repos[]}", name: "{input.name}" }` (S14).
 */
export const touchesSchema = s.record(
  capabilityReferenceSchema,
  s.record(s.string().max(64), s.string().min(1).max(200)),
);
