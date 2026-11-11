import { type Infer, s } from "@halonicjs/schema-kit";
import { agentId, collectionId, id, ModelParams, version } from "../../shared/fields.ts";
import { AgentHarness, AllowedSite, MAX_ALLOWED_SITES, WorkingFolder } from "./sandbox-fields.ts";

/** The shape of an agent's reply: free text, one of a list of options, or JSON. */
export const AgentOutput = s.discriminatedUnion("type", [
  s.object({ type: s.literal("text") }).strict(),
  s
    .object({
      type: s.literal("choice"),
      /**
       * The reply must be exactly one of these values, case-sensitively, once
       * the whitespace around it is trimmed. Any other reply fails the step
       * with `answer-not-an-option`.
       */
      options: s.array(s.string()).min(1),
    })
    .strict(),
  s
    .object({
      type: s.literal("json"),
      /** A JSON Schema the reply must satisfy. */
      schema: s.record(s.string(), s.unknown()).optional(),
    })
    .strict(),
]);

/** A field of a method's answer; a trailing "?" makes it optional. */
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

/**
 * A named task an agent can do, called by workflow steps
 * (`agent: finance, method: extract-invoice, with: { … }`).
 */
export const AgentMethod = s
  .object({
    description: s.string().optional(),
    /** Argument names; the instructions use them as {{name}}. */
    input: s.array(s.string()).default([]),
    instructions: s.string().min(1),
    /** Only these tools; leave out for all of the agent's tools, [] for none. */
    tools: s.array(s.string()).optional(),
    /** Model alias for this method; the agent's model otherwise. */
    model: s.string().optional(),
    /** Most model calls for one call of this method; the agent's maxSteps otherwise. */
    maxSteps: s.number().int().min(1).max(200).optional(),
    /** "text", or the fields of a JSON answer: { vendor: string, note: string? }. */
    output: s.union([s.literal("text"), s.record(s.string(), MethodField)]).default("text"),
  })
  .strict();

const colour = () => s.string().regex(/^#[0-9a-fA-F]{6}$/);

/** How the agent's character looks; colours default to a pair taken from the agent id. */
export const AgentCharacter = s
  .object({
    style: s.literal("buddy").default("buddy"),
    /** Soft: matte with a little grain. Glossy: a highlight. */
    surface: s.enum(["soft", "glossy"]).default("soft"),
    /** Elastic: wobbles and springs back. Firm: keeps its shape. */
    body: s.enum(["elastic", "firm"]).default("elastic"),
    top: s.literal("none").default("none"),
    /** Two colours, such as ["#3B82F6", "#8B5CF6"]. */
    colors: s.tuple([colour(), colour()]).optional(),
  })
  .strict();

/** `agents/<id>.agent.yaml`: an agent's model, instructions, tools and methods. */
export const Agent = s
  .object({
    version,
    id: agentId,
    name: s.string().min(1),
    description: s.string().optional(),
    /** Model alias (preferred) or "provider/model". */
    model: s.string().optional(),
    params: ModelParams.default({}),
    instructions: s.string().default(""),
    skills: s.array(s.string()).default([]),
    knowledge: s.array(s.string()).default([]),
    /** Connector ids whose tools this agent may use. */
    connectors: s.array(s.string()).default([]),
    /** Read-only access to the run history of earlier runs. Never sees secrets. */
    runLogs: s.boolean().default(false),
    /** Collections this agent may read and write. */
    collections: s.array(collectionId).default([]),
    /** Agents of the same hub this agent may hand a task to. */
    subagents: s.array(s.string()).default([]),
    /** Named tasks workflow steps can call. */
    methods: s.record(id, AgentMethod).default({}),
    output: AgentOutput.default({ type: "text" }),
    /** Most model calls per invocation (tool loops). */
    maxSteps: s.number().int().min(1).max(200).default(6),
    character: AgentCharacter.optional(),
    /** The program the agent runs in; Halonic's own loop when left out. */
    harness: AgentHarness.optional(),
    /** The one workspace folder a harness agent writes to; `files/agents/<id>` when left out. */
    workingFolder: WorkingFolder.optional(),
    /** Sites a harness agent may reach besides Halonic: host names or `*.` and a domain. */
    allowedSites: s.array(AllowedSite).max(MAX_ALLOWED_SITES).optional(),
  })
  .strict();

/** An agent, with defaults filled in. */
export type Agent = Infer<typeof Agent>;
/** One of an agent's methods. */
export type AgentMethod = Infer<typeof AgentMethod>;
/** The shape of an agent's reply. */
export type AgentOutput = Infer<typeof AgentOutput>;
/** A field type of a method's JSON answer. */
export type MethodField = Infer<typeof MethodField>;
