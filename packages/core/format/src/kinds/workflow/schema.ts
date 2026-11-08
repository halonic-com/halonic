import { type Infer, s } from "@halonicjs/schema-kit";
import { DURATION_PATTERN, id, version } from "../../shared/fields.ts";
import { Guard } from "../../shared/guard.ts";

/** A move from one state to another, on an event, a condition or a timer. */
export const Transition = s
  .object({
    to: id,
    /** The event that triggers it. "done" (the default) fires when the state's work finishes. */
    event: s.string().default("done"),
    when: Guard.optional(),
    /** Wait states only: fire this long after the state was entered ("30m", "4h", "2d"). */
    after: s
      .string()
      .regex(DURATION_PATTERN, 'use a number and a unit, e.g. "30m", "4h", "2d"')
      .optional(),
    label: s.string().optional(),
  })
  .strict();

/**
 * task: run an agent. wait: wait for a person. final: end. workflow: run
 * another workflow of the hub as one step. parallel: run several agents at
 * once. foreach: run an agent or a workflow once per item of a list.
 */
export const StateType = s.enum(["task", "wait", "final", "workflow", "parallel", "foreach"]);

const prompt = () => s.union([s.string(), s.record(s.string(), s.unknown())]);

/** One branch of a parallel state: an agent and its prompt or method. */
export const Branch = s
  .object({
    agent: s.string(),
    input: prompt().optional(),
    method: s.string().optional(),
    with: s.record(s.string(), s.unknown()).optional(),
  })
  .strict();

/** One state of a workflow. Which keys apply depends on its type. */
export const WorkflowState = s
  .object({
    type: StateType.default("task"),
    description: s.string().optional(),
    /** Task states: the agent to run on entry. */
    agent: s.string().optional(),
    /** Workflow states: a workflow id of the same hub. */
    workflow: s.string().optional(),
    /** Agent states: the prompt template. Workflow states: the child's input. */
    input: prompt().optional(),
    /** Task states: the data the agent gets after the prompt, such as [input.message]. */
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
    /** The context key the output is written to. */
    output: s.string().optional(),
    /** Task states: a context key that keeps the conversation across turns. */
    conversation: s.string().optional(),
    /** Task states: the reply format for this step, instead of the agent's own. */
    format: s.enum(["text", "json"]).optional(),
    /** After this step: a signal routines can start on. */
    signal: s
      .object({ name: s.string().min(1), data: s.record(s.string(), s.unknown()).default({}) })
      .strict()
      .optional(),
    /** Task states: call this method of the agent. */
    method: id.optional(),
    /** The method's arguments, as templates. */
    with: s.record(s.string(), s.unknown()).optional(),
    /** For-each states: the list to go through, a template such as "{{context.emails}}". */
    items: s.string().optional(),
    /** For-each states: the current item's name in templates (default "item"). */
    as: id.optional(),
    /** For-each states: how many items run at the same time (default 1, in order). */
    concurrency: s.number().int().min(1).max(16).optional(),
    /** Parallel states: branches by name. */
    branches: s.record(id, Branch).optional(),
    /** Parallel states: "all" (default) needs every branch to succeed, "any" one. */
    join: s.enum(["all", "any"]).optional(),
    /** Parallel states with join "all": a failed branch gives { error } instead of failing. */
    continueOnError: s.boolean().optional(),
    /** Save the agent's output as an artifact. */
    artifact: s
      .object({ name: s.string(), mediaType: s.string().default("text/markdown") })
      .strict()
      .optional(),
    on: s.array(Transition).default([]),
  })
  .strict();

/** `workflows/<id>.workflow.yaml`: a state machine of agent steps, waits and subflows. */
export const Workflow = s
  .object({
    version,
    id,
    name: s.string().min(1),
    description: s.string().optional(),
    initial: id,
    /** Initial context values. */
    context: s.record(s.string(), s.unknown()).default({}),
    /** Offer this workflow in the Inbox as a request: the typed text becomes input[field]. */
    start: s
      .object({ label: s.string().min(1), field: s.string().min(1) })
      .strict()
      .optional(),
    states: s.record(s.string(), WorkflowState),
    /** Editor-only node positions; engines ignore them. */
    layout: s.record(s.string(), s.object({ x: s.number(), y: s.number() })).default({}),
  })
  .strict();

/** A workflow, with defaults filled in. */
export type Workflow = Infer<typeof Workflow>;
/** One state of a workflow. */
export type WorkflowState = Infer<typeof WorkflowState>;
/** A transition between states. */
export type Transition = Infer<typeof Transition>;
/** One branch of a parallel state. */
export type Branch = Infer<typeof Branch>;
/** The type of a workflow state. */
export type StateType = Infer<typeof StateType>;
