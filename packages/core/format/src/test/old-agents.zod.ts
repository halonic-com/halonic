// The old repo's skill, hub and agent schemas (784f78d:
// packages/core/schema/src/index.ts), written with Zod. See old-schemas.zod.ts.
import { z } from "zod";
import { id, ModelAlias, ModelParams, version } from "./old-workspace.zod.ts";

export const SkillFrontMatter = z
  .object({
    name: z.string().min(1),
    description: z.string().min(1),
  })
  .passthrough();

export const Skill = z.object({
  id,
  name: z.string(),
  description: z.string(),
  body: z.string(),
});

export const HubUses = z
  .object({
    connectors: z.array(id).default([]),
    skills: z.array(id).default([]),
    knowledge: z.array(id).default([]),
    collections: z.array(id).default([]),
  })
  .strict();

export const Hub = z
  .object({
    version,
    id,
    name: z.string().min(1),
    description: z.string().optional(),
    defaults: z
      .object({ runtime: z.string().optional(), model: z.string().optional() })
      .strict()
      .default({}),
    models: z.record(z.string(), ModelAlias).default({}),
    uses: HubUses.optional(),
  })
  .strict();

export const AgentOutput = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text") }).strict(),
  z
    .object({
      type: z.literal("choice"),
      options: z.array(z.string()).min(1),
    })
    .strict(),
  z
    .object({
      type: z.literal("json"),
      schema: z.record(z.string(), z.unknown()).optional(),
    })
    .strict(),
]);

export const MethodField = z.enum([
  "string",
  "number",
  "boolean",
  "list",
  "object",
  "string?",
  "number?",
  "boolean?",
  "list?",
  "object?",
]);

export const AgentMethod = z
  .object({
    description: z.string().optional(),
    input: z.array(z.string()).default([]),
    instructions: z.string().min(1),
    tools: z.array(z.string()).optional(),
    model: z.string().optional(),
    maxSteps: z.number().int().min(1).max(200).optional(),
    output: z.union([z.literal("text"), z.record(z.string(), MethodField)]).default("text"),
  })
  .strict();

export const AgentCharacter = z
  .object({
    style: z.literal("buddy").default("buddy"),
    surface: z.enum(["soft", "glossy"]).default("soft"),
    body: z.enum(["elastic", "firm"]).default("elastic"),
    top: z.literal("none").default("none"),
    colors: z
      .tuple([z.string().regex(/^#[0-9a-fA-F]{6}$/), z.string().regex(/^#[0-9a-fA-F]{6}$/)])
      .optional(),
  })
  .strict();

export const Agent = z
  .object({
    version,
    id,
    name: z.string().min(1),
    description: z.string().optional(),
    model: z.string().optional(),
    params: ModelParams.default({}),
    instructions: z.string().default(""),
    skills: z.array(z.string()).default([]),
    knowledge: z.array(z.string()).default([]),
    connectors: z.array(z.string()).default([]),
    runLogs: z.boolean().default(false),
    collections: z.array(z.string()).default([]),
    subagents: z.array(z.string()).default([]),
    methods: z.record(id, AgentMethod).default({}),
    output: AgentOutput.default({ type: "text" }),
    maxSteps: z.number().int().min(1).max(200).default(6),
    character: AgentCharacter.optional(),
  })
  .strict();
