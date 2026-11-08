// The old repo's workspace-level schemas (784f78d: packages/core/schema/src/index.ts,
// up to the agents), written with Zod. See old-schemas.zod.ts.
import { z } from "zod";

export const SCHEMA_VERSION = 1 as const;

export const id = z
  .string()
  .min(1)
  .regex(/^[a-z0-9][a-z0-9-_]*$/, "use lowercase letters, digits, '-' or '_'");

export const version = z.literal(SCHEMA_VERSION).default(SCHEMA_VERSION);

export const ModelParams = z
  .object({
    temperature: z.number().min(0).max(2).optional(),
    topP: z.number().min(0).max(1).optional(),
    maxTokens: z.number().int().positive().optional(),
    stop: z.array(z.string()).optional(),
    reasoningEffort: z.enum(["low", "medium", "high"]).optional(),
    extra: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export const Privacy = z
  .object({
    localOnly: z.boolean().default(false),
  })
  .strict();

export const Deployment = z
  .object({
    name: z.string().min(1),
    description: z.string().optional(),
    host: z.enum(["local", "cloudflare"]).default("local"),
    stage: z.enum(["development", "production"]).default("development"),
    shadow: z.boolean().default(false),
  })
  .strict();

export const Deployments = z
  .object({
    version,
    default: z.string().optional(),
    deployments: z
      .record(id, Deployment)
      .refine((d) => Object.keys(d).length > 0, "Name at least one deployment"),
  })
  .strict();

export const SessionAssistant = z
  .object({
    model: z.string().min(1).optional(),
    params: ModelParams.optional(),
    maxSteps: z.number().int().min(1).max(64).optional(),
    connectors: z.boolean().optional(),
    instructions: z.string().optional(),
  })
  .strict();

export const WorkspaceSettings = z
  .object({
    version,
    id,
    name: z.string().min(1),
    description: z.string().optional(),
    privacy: Privacy.default({ localOnly: false }),
    budget: z
      .object({
        currency: z.string().min(1).default("EUR"),
        perRun: z.number().positive().optional(),
        monthly: z.number().positive().optional(),
      })
      .strict()
      .optional(),
    defaults: z
      .object({
        runtime: z.string().default("inprocess"),
        model: z.string().default("default"),
      })
      .strict()
      .default({ runtime: "inprocess", model: "default" }),
    assistant: SessionAssistant.optional(),
    appearance: z
      .object({
        characters: z.enum(["expressive", "minimal", "off"]).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export const Provider = z
  .object({
    version,
    id,
    name: z.string().optional(),
    type: z.string().min(1),
    baseUrl: z.string().url().optional(),
    secret: z.string().optional(),
    local: z.boolean().default(false),
    options: z.record(z.string(), z.unknown()).default({}),
  })
  .strict();

export const ModelPrice = z
  .object({
    input: z.number().min(0),
    output: z.number().min(0),
  })
  .strict();

export const ModelTarget = z
  .object({
    provider: id,
    model: z.string().min(1),
    params: ModelParams.default({}),
    price: ModelPrice.optional(),
  })
  .strict();

export const ModelAlias = ModelTarget.extend({
  description: z.string().optional(),
  fallback: z.array(z.string()).default([]),
}).strict();

export const Models = z
  .object({
    version,
    aliases: z.record(z.string(), ModelAlias),
  })
  .strict();

export const Runtime = z
  .object({
    version,
    id,
    type: z.string().min(1),
    options: z.record(z.string(), z.unknown()).default({}),
  })
  .strict();

export const KnowledgeSource = z
  .object({
    version,
    id,
    name: z.string().optional(),
    description: z.string().optional(),
    summary: z.string().optional(),
    mode: z.enum(["tools", "auto"]).optional(),
    provider: z.string().min(1),
    writable: z.boolean().optional(),
    config: z.record(z.string(), z.unknown()).default({}),
  })
  .strict();

export const Connector = z
  .object({
    version,
    id,
    name: z.string().optional(),
    description: z.string().optional(),
    transport: z.union([
      z
        .object({
          http: z
            .object({ url: z.string().url(), headers: z.record(z.string(), z.string()).optional() })
            .strict(),
        })
        .strict(),
      z
        .object({
          stdio: z
            .object({
              command: z.string().min(1),
              args: z.array(z.string()).default([]),
              env: z.record(z.string(), z.string()).optional(),
              secretEnv: z.record(z.string(), z.string()).optional(),
              cwd: z.string().optional(),
            })
            .strict(),
        })
        .strict(),
      z
        .object({
          google: z
            .object({
              account: z.string().email(),
              client: z.string().default("google"),
            })
            .strict(),
        })
        .strict(),
    ]),
    secret: z.string().optional(),
    tools: z
      .object({
        allow: z.array(z.string()).optional(),
        approve: z.array(z.string()).default([]),
      })
      .strict()
      .default({ approve: [] }),
    local: z.boolean().optional(),
  })
  .strict();
