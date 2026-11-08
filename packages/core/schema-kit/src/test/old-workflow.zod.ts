// The old repo's workflow, routine and collection schemas (784f78d:
// packages/core/schema/src/index.ts from the guards on, and collections.ts),
// written with Zod. See old-schemas.zod.ts.
import { z } from "zod";
import { id, version } from "./old-workspace.zod.ts";

export type Guard =
  | { equals: [unknown, unknown] }
  | { notEquals: [unknown, unknown] }
  | { contains: [unknown, unknown] }
  | { exists: string }
  | { gt: [unknown, unknown] }
  | { gte: [unknown, unknown] }
  | { lt: [unknown, unknown] }
  | { lte: [unknown, unknown] }
  | { not: Guard }
  | { all: Guard[] }
  | { any: Guard[] };

export const Guard: z.ZodType<Guard> = z.lazy(() =>
  z.union([
    z.object({ equals: z.tuple([z.unknown(), z.unknown()]) }).strict(),
    z.object({ notEquals: z.tuple([z.unknown(), z.unknown()]) }).strict(),
    z.object({ contains: z.tuple([z.unknown(), z.unknown()]) }).strict(),
    z.object({ exists: z.string() }).strict(),
    z.object({ gt: z.tuple([z.unknown(), z.unknown()]) }).strict(),
    z.object({ gte: z.tuple([z.unknown(), z.unknown()]) }).strict(),
    z.object({ lt: z.tuple([z.unknown(), z.unknown()]) }).strict(),
    z.object({ lte: z.tuple([z.unknown(), z.unknown()]) }).strict(),
    z.object({ not: Guard }).strict(),
    z.object({ all: z.array(Guard) }).strict(),
    z.object({ any: z.array(Guard) }).strict(),
  ]),
) as z.ZodType<Guard>;

export const Transition = z
  .object({
    to: id,
    event: z.string().default("done"),
    when: Guard.optional(),
    after: z
      .string()
      .regex(/^[1-9]\d*(m|h|d)$/, 'use a number and a unit, e.g. "30m", "4h", "2d"')
      .optional(),
    label: z.string().optional(),
  })
  .strict();

export const StateType = z.enum(["task", "wait", "final", "workflow", "parallel", "foreach"]);

export const Branch = z
  .object({
    agent: z.string(),
    input: z.union([z.string(), z.record(z.string(), z.unknown())]).optional(),
    method: z.string().optional(),
    with: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export const WorkflowState = z
  .object({
    type: StateType.default("task"),
    description: z.string().optional(),
    agent: z.string().optional(),
    workflow: z.string().optional(),
    input: z.union([z.string(), z.record(z.string(), z.unknown())]).optional(),
    gets: z
      .array(
        z
          .string()
          .regex(
            /^(input|context)\.[^.\s]+(\.[^.\s]+)*$/,
            'use "input.<name>" or "context.<name>"',
          ),
      )
      .optional(),
    output: z.string().optional(),
    conversation: z.string().optional(),
    format: z.enum(["text", "json"]).optional(),
    signal: z
      .object({ name: z.string().min(1), data: z.record(z.string(), z.unknown()).default({}) })
      .strict()
      .optional(),
    method: id.optional(),
    with: z.record(z.string(), z.unknown()).optional(),
    items: z.string().optional(),
    as: id.optional(),
    concurrency: z.number().int().min(1).max(16).optional(),
    branches: z.record(id, Branch).optional(),
    join: z.enum(["all", "any"]).optional(),
    continueOnError: z.boolean().optional(),
    artifact: z
      .object({ name: z.string(), mediaType: z.string().default("text/markdown") })
      .strict()
      .optional(),
    on: z.array(Transition).default([]),
  })
  .strict();

export const Workflow = z
  .object({
    version,
    id,
    name: z.string().min(1),
    description: z.string().optional(),
    initial: id,
    context: z.record(z.string(), z.unknown()).default({}),
    start: z
      .object({ label: z.string().min(1), field: z.string().min(1) })
      .strict()
      .optional(),
    states: z.record(z.string(), WorkflowState),
    layout: z.record(z.string(), z.object({ x: z.number(), y: z.number() })).default({}),
  })
  .strict();

export const WorkflowTestCase = z
  .object({
    name: z.string().min(1),
    input: z.record(z.string(), z.unknown()).default({}),
    mocks: z.record(z.string(), z.array(z.string())).default({}),
    events: z
      .array(
        z.union([
          z.string(),
          z.object({ advance: z.string().regex(/^[1-9]\d*(m|h|d)$/) }).strict(),
          z.object({ event: z.string().min(1), payload: z.unknown() }).strict(),
        ]),
      )
      .default([]),
    tools: z.record(z.string(), z.array(z.string())).default({}),
    expect: z
      .object({
        states: z.array(z.string()).optional(),
        final: z.string().optional(),
        status: z.enum(["completed", "waiting", "failed"]).optional(),
        context: z.record(z.string(), z.unknown()).optional(),
        artifacts: z.array(z.string()).optional(),
      })
      .strict()
      .default({}),
  })
  .strict();

export const WorkflowTest = z
  .object({
    version,
    workflow: id,
    cases: z.array(WorkflowTestCase).min(1),
  })
  .strict();

export const RoutineTrigger = z.union([
  z
    .object({
      schedule: z.string().min(1),
      timezone: z.string().optional(),
    })
    .strict(),
  z
    .object({
      every: z
        .string()
        .regex(/^[1-9]\d*(m|h|d)$/, 'use a number and a unit, e.g. "15m", "1h", "1d"'),
    })
    .strict(),
  z.object({ manual: z.literal(true) }).strict(),
  z
    .object({
      signal: z.object({ name: z.string().min(1), when: Guard.optional() }).strict(),
    })
    .strict(),
  z
    .object({
      mail: z
        .object({
          connector: id,
          query: z.string().default("in:inbox"),
          every: z
            .string()
            .regex(/^[1-9]d*(m|h|d)$/, 'use a number and a unit, e.g. "2m"')
            .default("2m"),
        })
        .strict(),
    })
    .strict(),
]);

export const RoutineTarget = z.union([
  z
    .object({
      hub: id.optional(),
      workflow: id,
      input: z.record(z.string(), z.unknown()).default({}),
    })
    .strict(),
  z
    .object({
      hub: id.optional(),
      agent: id,
      prompt: z.string().min(1),
    })
    .strict(),
]);

export const Routine = z
  .object({
    version,
    id,
    name: z.string().min(1),
    description: z.string().optional(),
    enabled: z.boolean().default(true),
    trigger: RoutineTrigger,
    run: RoutineTarget,
    overlap: z.enum(["skip", "queue", "allow"]).default("skip"),
    catchUp: z.enum(["none", "last", "all"]).default("last"),
  })
  .strict();

const name = z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]*$/, "Field names: letters, digits and _");

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

export const CollectionField = z
  .object({
    type: z.enum(FIELD_TYPES),
    description: z.string().optional(),
    required: z.boolean().default(false),
    values: z.array(z.string()).optional(),
    collection: z.string().optional(),
    min: z.number().optional(),
    max: z.number().optional(),
    default: z.unknown().optional(),
    compute: z.string().optional(),
  })
  .strict()
  .superRefine((f, ctx) => {
    if (f.type === "choice" && !f.values?.length)
      ctx.addIssue({ code: "custom", message: "A choice field needs values" });
    if (f.type === "ref" && !f.collection)
      ctx.addIssue({ code: "custom", message: "A ref field needs a collection" });
  });

const WhereValue = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
  z.array(z.union([z.string(), z.number(), z.boolean(), z.null()])),
  z
    .object({
      gt: z.unknown(),
      gte: z.unknown(),
      lt: z.unknown(),
      lte: z.unknown(),
      not: z.unknown(),
    })
    .partial()
    .strict(),
]);

export const CollectionView = z
  .object({
    description: z.string().optional(),
    where: z.record(z.string(), WhereValue).default({}),
    total: z.string().optional(),
    sort: z.string().optional(),
  })
  .strict();

export const Collection = z
  .object({
    version: z.literal(1).default(1),
    id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
    name: z.string().min(1),
    description: z.string().optional(),
    implements: z.array(z.string()).default([]),
    fields: z
      .record(name, CollectionField)
      .refine((f) => Object.keys(f).length > 0, "A collection needs fields"),
    views: z.record(z.string(), CollectionView).default({}),
    seed: z
      .array(z.record(z.string(), z.unknown()).and(z.object({ id: z.string().min(1) })))
      .default([]),
  })
  .strict();
