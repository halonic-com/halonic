// The old repo's workflow, routine and collection schemas (784f78d:
// packages/core/schema/src/index.ts from the guards on, and collections.ts),
// written with schema-kit. See old-schemas.kit.ts.
import { type Schema, s } from "../index.ts";
import { id, version } from "./old-workspace.kit.ts";

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

export const Guard: Schema<Guard> = s.lazy(() =>
  s.union([
    s.object({ equals: s.tuple([s.unknown(), s.unknown()]) }).strict(),
    s.object({ notEquals: s.tuple([s.unknown(), s.unknown()]) }).strict(),
    s.object({ contains: s.tuple([s.unknown(), s.unknown()]) }).strict(),
    s.object({ exists: s.string() }).strict(),
    s.object({ gt: s.tuple([s.unknown(), s.unknown()]) }).strict(),
    s.object({ gte: s.tuple([s.unknown(), s.unknown()]) }).strict(),
    s.object({ lt: s.tuple([s.unknown(), s.unknown()]) }).strict(),
    s.object({ lte: s.tuple([s.unknown(), s.unknown()]) }).strict(),
    s.object({ not: Guard }).strict(),
    s.object({ all: s.array(Guard) }).strict(),
    s.object({ any: s.array(Guard) }).strict(),
  ]),
) as Schema<Guard>;

export const Transition = s
  .object({
    to: id,
    event: s.string().default("done"),
    when: Guard.optional(),
    after: s
      .string()
      .regex(/^[1-9]\d*(m|h|d)$/, 'use a number and a unit, e.g. "30m", "4h", "2d"')
      .optional(),
    label: s.string().optional(),
  })
  .strict();

export const StateType = s.enum(["task", "wait", "final", "workflow", "parallel", "foreach"]);

export const Branch = s
  .object({
    agent: s.string(),
    input: s.union([s.string(), s.record(s.string(), s.unknown())]).optional(),
    method: s.string().optional(),
    with: s.record(s.string(), s.unknown()).optional(),
  })
  .strict();

export const WorkflowState = s
  .object({
    type: StateType.default("task"),
    description: s.string().optional(),
    agent: s.string().optional(),
    workflow: s.string().optional(),
    input: s.union([s.string(), s.record(s.string(), s.unknown())]).optional(),
    gets: s
      .array(
        s
          .string()
          .regex(
            /^(input|context)\.[^.\s]+(\.[^.\s]+)*$/,
            'use "input.<name>" or "context.<name>"',
          ),
      )
      .optional(),
    output: s.string().optional(),
    conversation: s.string().optional(),
    format: s.enum(["text", "json"]).optional(),
    signal: s
      .object({ name: s.string().min(1), data: s.record(s.string(), s.unknown()).default({}) })
      .strict()
      .optional(),
    method: id.optional(),
    with: s.record(s.string(), s.unknown()).optional(),
    items: s.string().optional(),
    as: id.optional(),
    concurrency: s.number().int().min(1).max(16).optional(),
    branches: s.record(id, Branch).optional(),
    join: s.enum(["all", "any"]).optional(),
    continueOnError: s.boolean().optional(),
    artifact: s
      .object({ name: s.string(), mediaType: s.string().default("text/markdown") })
      .strict()
      .optional(),
    on: s.array(Transition).default([]),
  })
  .strict();

export const Workflow = s
  .object({
    version,
    id,
    name: s.string().min(1),
    description: s.string().optional(),
    initial: id,
    context: s.record(s.string(), s.unknown()).default({}),
    start: s
      .object({ label: s.string().min(1), field: s.string().min(1) })
      .strict()
      .optional(),
    states: s.record(s.string(), WorkflowState),
    layout: s.record(s.string(), s.object({ x: s.number(), y: s.number() })).default({}),
  })
  .strict();

export const WorkflowTestCase = s
  .object({
    name: s.string().min(1),
    input: s.record(s.string(), s.unknown()).default({}),
    mocks: s.record(s.string(), s.array(s.string())).default({}),
    events: s
      .array(
        s.union([
          s.string(),
          s.object({ advance: s.string().regex(/^[1-9]\d*(m|h|d)$/) }).strict(),
          s.object({ event: s.string().min(1), payload: s.unknown() }).strict(),
        ]),
      )
      .default([]),
    tools: s.record(s.string(), s.array(s.string())).default({}),
    expect: s
      .object({
        states: s.array(s.string()).optional(),
        final: s.string().optional(),
        status: s.enum(["completed", "waiting", "failed"]).optional(),
        context: s.record(s.string(), s.unknown()).optional(),
        artifacts: s.array(s.string()).optional(),
      })
      .strict()
      .default({}),
  })
  .strict();

export const WorkflowTest = s
  .object({
    version,
    workflow: id,
    cases: s.array(WorkflowTestCase).min(1),
  })
  .strict();

export const RoutineTrigger = s.union([
  s
    .object({
      schedule: s.string().min(1),
      timezone: s.string().optional(),
    })
    .strict(),
  s
    .object({
      every: s
        .string()
        .regex(/^[1-9]\d*(m|h|d)$/, 'use a number and a unit, e.g. "15m", "1h", "1d"'),
    })
    .strict(),
  s.object({ manual: s.literal(true) }).strict(),
  s
    .object({
      signal: s.object({ name: s.string().min(1), when: Guard.optional() }).strict(),
    })
    .strict(),
  s
    .object({
      mail: s
        .object({
          connector: id,
          query: s.string().default("in:inbox"),
          every: s
            .string()
            .regex(/^[1-9]d*(m|h|d)$/, 'use a number and a unit, e.g. "2m"')
            .default("2m"),
        })
        .strict(),
    })
    .strict(),
]);

export const RoutineTarget = s.union([
  s
    .object({
      hub: id.optional(),
      workflow: id,
      input: s.record(s.string(), s.unknown()).default({}),
    })
    .strict(),
  s
    .object({
      hub: id.optional(),
      agent: id,
      prompt: s.string().min(1),
    })
    .strict(),
]);

export const Routine = s
  .object({
    version,
    id,
    name: s.string().min(1),
    description: s.string().optional(),
    enabled: s.boolean().default(true),
    trigger: RoutineTrigger,
    run: RoutineTarget,
    overlap: s.enum(["skip", "queue", "allow"]).default("skip"),
    catchUp: s.enum(["none", "last", "all"]).default("last"),
  })
  .strict();

const name = s.string().regex(/^[a-zA-Z][a-zA-Z0-9_]*$/, "Field names: letters, digits and _");

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

export const CollectionField = s
  .object({
    type: s.enum(FIELD_TYPES),
    description: s.string().optional(),
    required: s.boolean().default(false),
    values: s.array(s.string()).optional(),
    collection: s.string().optional(),
    min: s.number().optional(),
    max: s.number().optional(),
    default: s.unknown().optional(),
    compute: s.string().optional(),
  })
  .strict()
  .superRefine((f, ctx) => {
    if (f.type === "choice" && !f.values?.length)
      ctx.addIssue({ code: "custom", message: "A choice field needs values" });
    if (f.type === "ref" && !f.collection)
      ctx.addIssue({ code: "custom", message: "A ref field needs a collection" });
  });

const WhereValue = s.union([
  s.string(),
  s.number(),
  s.boolean(),
  s.null(),
  s.array(s.union([s.string(), s.number(), s.boolean(), s.null()])),
  s
    .object({
      gt: s.unknown(),
      gte: s.unknown(),
      lt: s.unknown(),
      lte: s.unknown(),
      not: s.unknown(),
    })
    .partial()
    .strict(),
]);

export const CollectionView = s
  .object({
    description: s.string().optional(),
    where: s.record(s.string(), WhereValue).default({}),
    total: s.string().optional(),
    sort: s.string().optional(),
  })
  .strict();

export const Collection = s
  .object({
    version: s.literal(1).default(1),
    id: s.string().regex(/^[a-z0-9][a-z0-9-]*$/),
    name: s.string().min(1),
    description: s.string().optional(),
    implements: s.array(s.string()).default([]),
    fields: s
      .record(name, CollectionField)
      .refine((f) => Object.keys(f).length > 0, "A collection needs fields"),
    views: s.record(s.string(), CollectionView).default({}),
    seed: s
      .array(s.record(s.string(), s.unknown()).and(s.object({ id: s.string().min(1) })))
      .default([]),
  })
  .strict();
