import { type Infer, s } from "@halonicjs/schema-kit";
import { DURATION_PATTERN, id, version } from "../../shared/fields.ts";

/**
 * One step after the start: an event name (such as "approve"), a move of the
 * test clock ({ advance: "2d" }) that fires the timers then due, or an event
 * with data ({ event: reject, payload: { comment: "Shorter please" } }).
 */
const TestEvent = s.union([
  s.string(),
  s.object({ advance: s.string().regex(DURATION_PATTERN) }).strict(),
  s.object({ event: s.string().min(1), payload: s.unknown() }).strict(),
]);

/** One test case: the input, the scripted replies, the events and what to expect. */
export const WorkflowTestCase = s
  .object({
    name: s.string().min(1),
    input: s.record(s.string(), s.unknown()).default({}),
    /** Scripted model replies per agent id, used in order. */
    mocks: s.record(s.string(), s.array(s.string())).default({}),
    events: s.array(TestEvent).default([]),
    /** Scripted connector tool results, keyed "<connector>.<tool>". Tests never contact real connectors. */
    tools: s.record(s.string(), s.array(s.string())).default({}),
    expect: s
      .object({
        /** The exact sequence of states visited. */
        states: s.array(s.string()).optional(),
        final: s.string().optional(),
        status: s.enum(["completed", "waiting", "failed"]).optional(),
        /** A partial match on the final context. */
        context: s.record(s.string(), s.unknown()).optional(),
        /** Files the run must have saved; it may save others too. */
        artifacts: s.array(s.string()).optional(),
      })
      .strict()
      .default({}),
  })
  .strict();

/** `workflows/<workflow>.test.yaml`: test cases for one workflow, run on scripted models. */
export const WorkflowTest = s
  .object({
    version,
    workflow: id,
    cases: s.array(WorkflowTestCase).min(1),
  })
  .strict();

/** A workflow test file, with defaults filled in. */
export type WorkflowTest = Infer<typeof WorkflowTest>;
/** One case of a workflow test. */
export type WorkflowTestCase = Infer<typeof WorkflowTestCase>;
