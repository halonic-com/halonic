// The old repo's skill, hub and agent schemas (784f78d:
// packages/core/schema/src/index.ts), written with schema-kit. See old-schemas.kit.ts.
import { s } from "../index.ts";
import { id, ModelAlias, ModelParams, version } from "./old-workspace.kit.ts";

export const SkillFrontMatter = s
  .object({
    name: s.string().min(1),
    description: s.string().min(1),
  })
  .passthrough();

export const Skill = s.object({
  id,
  name: s.string(),
  description: s.string(),
  body: s.string(),
});

export const HubUses = s
  .object({
    connectors: s.array(id).default([]),
    skills: s.array(id).default([]),
    knowledge: s.array(id).default([]),
    collections: s.array(id).default([]),
  })
  .strict();

export const Hub = s
  .object({
    version,
    id,
    name: s.string().min(1),
    description: s.string().optional(),
    defaults: s
      .object({ runtime: s.string().optional(), model: s.string().optional() })
      .strict()
      .default({}),
    models: s.record(s.string(), ModelAlias).default({}),
    uses: HubUses.optional(),
  })
  .strict();

export const AgentOutput = s.discriminatedUnion("type", [
  s.object({ type: s.literal("text") }).strict(),
  s
    .object({
      type: s.literal("choice"),
      options: s.array(s.string()).min(1),
    })
    .strict(),
  s
    .object({
      type: s.literal("json"),
      schema: s.record(s.string(), s.unknown()).optional(),
    })
    .strict(),
]);

export const MethodField = s.enum([
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

export const AgentMethod = s
  .object({
    description: s.string().optional(),
    input: s.array(s.string()).default([]),
    instructions: s.string().min(1),
    tools: s.array(s.string()).optional(),
    model: s.string().optional(),
    maxSteps: s.number().int().min(1).max(200).optional(),
    output: s.union([s.literal("text"), s.record(s.string(), MethodField)]).default("text"),
  })
  .strict();

export const AgentCharacter = s
  .object({
    style: s.literal("buddy").default("buddy"),
    surface: s.enum(["soft", "glossy"]).default("soft"),
    body: s.enum(["elastic", "firm"]).default("elastic"),
    top: s.literal("none").default("none"),
    colors: s
      .tuple([s.string().regex(/^#[0-9a-fA-F]{6}$/), s.string().regex(/^#[0-9a-fA-F]{6}$/)])
      .optional(),
  })
  .strict();

export const Agent = s
  .object({
    version,
    id,
    name: s.string().min(1),
    description: s.string().optional(),
    model: s.string().optional(),
    params: ModelParams.default({}),
    instructions: s.string().default(""),
    skills: s.array(s.string()).default([]),
    knowledge: s.array(s.string()).default([]),
    connectors: s.array(s.string()).default([]),
    runLogs: s.boolean().default(false),
    collections: s.array(s.string()).default([]),
    subagents: s.array(s.string()).default([]),
    methods: s.record(id, AgentMethod).default({}),
    output: AgentOutput.default({ type: "text" }),
    maxSteps: s.number().int().min(1).max(200).default(6),
    character: AgentCharacter.optional(),
  })
  .strict();
