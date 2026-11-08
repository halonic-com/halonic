// The old repo's workspace-level schemas (784f78d: packages/core/schema/src/index.ts,
// up to the agents), written with schema-kit. See old-schemas.kit.ts.
import { s } from "../index.ts";

export const SCHEMA_VERSION = 1 as const;

export const id = s
  .string()
  .min(1)
  .regex(/^[a-z0-9][a-z0-9-_]*$/, "use lowercase letters, digits, '-' or '_'");

export const version = s.literal(SCHEMA_VERSION).default(SCHEMA_VERSION);

export const ModelParams = s
  .object({
    temperature: s.number().min(0).max(2).optional(),
    topP: s.number().min(0).max(1).optional(),
    maxTokens: s.number().int().positive().optional(),
    stop: s.array(s.string()).optional(),
    reasoningEffort: s.enum(["low", "medium", "high"]).optional(),
    extra: s.record(s.string(), s.unknown()).optional(),
  })
  .strict();

export const Privacy = s
  .object({
    localOnly: s.boolean().default(false),
  })
  .strict();

export const Deployment = s
  .object({
    name: s.string().min(1),
    description: s.string().optional(),
    host: s.enum(["local", "cloudflare"]).default("local"),
    stage: s.enum(["development", "production"]).default("development"),
    shadow: s.boolean().default(false),
  })
  .strict();

export const Deployments = s
  .object({
    version,
    default: s.string().optional(),
    deployments: s
      .record(id, Deployment)
      .refine((d) => Object.keys(d).length > 0, "Name at least one deployment"),
  })
  .strict();

export const SessionAssistant = s
  .object({
    model: s.string().min(1).optional(),
    params: ModelParams.optional(),
    maxSteps: s.number().int().min(1).max(64).optional(),
    connectors: s.boolean().optional(),
    instructions: s.string().optional(),
  })
  .strict();

export const WorkspaceSettings = s
  .object({
    version,
    id,
    name: s.string().min(1),
    description: s.string().optional(),
    privacy: Privacy.default({ localOnly: false }),
    budget: s
      .object({
        currency: s.string().min(1).default("EUR"),
        perRun: s.number().positive().optional(),
        monthly: s.number().positive().optional(),
      })
      .strict()
      .optional(),
    defaults: s
      .object({
        runtime: s.string().default("inprocess"),
        model: s.string().default("default"),
      })
      .strict()
      .default({ runtime: "inprocess", model: "default" }),
    assistant: SessionAssistant.optional(),
    appearance: s
      .object({
        characters: s.enum(["expressive", "minimal", "off"]).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export const Provider = s
  .object({
    version,
    id,
    name: s.string().optional(),
    type: s.string().min(1),
    baseUrl: s.string().url().optional(),
    secret: s.string().optional(),
    local: s.boolean().default(false),
    options: s.record(s.string(), s.unknown()).default({}),
  })
  .strict();

export const ModelPrice = s
  .object({
    input: s.number().min(0),
    output: s.number().min(0),
  })
  .strict();

export const ModelTarget = s
  .object({
    provider: id,
    model: s.string().min(1),
    params: ModelParams.default({}),
    price: ModelPrice.optional(),
  })
  .strict();

export const ModelAlias = ModelTarget.extend({
  description: s.string().optional(),
  fallback: s.array(s.string()).default([]),
}).strict();

export const Models = s
  .object({
    version,
    aliases: s.record(s.string(), ModelAlias),
  })
  .strict();

export const Runtime = s
  .object({
    version,
    id,
    type: s.string().min(1),
    options: s.record(s.string(), s.unknown()).default({}),
  })
  .strict();

export const KnowledgeSource = s
  .object({
    version,
    id,
    name: s.string().optional(),
    description: s.string().optional(),
    summary: s.string().optional(),
    mode: s.enum(["tools", "auto"]).optional(),
    provider: s.string().min(1),
    writable: s.boolean().optional(),
    config: s.record(s.string(), s.unknown()).default({}),
  })
  .strict();

export const Connector = s
  .object({
    version,
    id,
    name: s.string().optional(),
    description: s.string().optional(),
    transport: s.union([
      s
        .object({
          http: s
            .object({ url: s.string().url(), headers: s.record(s.string(), s.string()).optional() })
            .strict(),
        })
        .strict(),
      s
        .object({
          stdio: s
            .object({
              command: s.string().min(1),
              args: s.array(s.string()).default([]),
              env: s.record(s.string(), s.string()).optional(),
              secretEnv: s.record(s.string(), s.string()).optional(),
              cwd: s.string().optional(),
            })
            .strict(),
        })
        .strict(),
      s
        .object({
          google: s
            .object({
              account: s.string().email(),
              client: s.string().default("google"),
            })
            .strict(),
        })
        .strict(),
    ]),
    secret: s.string().optional(),
    tools: s
      .object({
        allow: s.array(s.string()).optional(),
        approve: s.array(s.string()).default([]),
      })
      .strict()
      .default({ approve: [] }),
    local: s.boolean().optional(),
  })
  .strict();
