import { type Infer, s } from "@halonicjs/schema-kit";
import { DURATION_PATTERN, id, version } from "../../shared/fields.ts";
import { Guard } from "../../shared/guard.ts";

/** On a schedule: five-field cron or a shortcut such as @daily, in a time zone. */
const ScheduleTrigger = s
  .object({
    schedule: s.string().min(1),
    /** IANA time zone, such as Europe/Amsterdam. Default: the machine's zone. */
    timezone: s.string().optional(),
  })
  .strict();

/** At a fixed interval. */
const EveryTrigger = s
  .object({
    every: s.string().regex(DURATION_PATTERN, 'use a number and a unit, e.g. "15m", "1h", "1d"'),
  })
  .strict();

/** Only when someone starts it. */
const ManualTrigger = s.object({ manual: s.literal(true) }).strict();

/** When a workflow step sends a signal; `when` filters on its data. */
const SignalTrigger = s
  .object({
    signal: s.object({ name: s.string().min(1), when: Guard.optional() }).strict(),
  })
  .strict();

/** New mail in a Google connector's mailbox, checked without a model; one run per message. */
const MailTrigger = s
  .object({
    mail: s
      .object({
        /** A connector with `transport: google`. */
        connector: id,
        /** Gmail search for the mail that counts. */
        query: s.string().default("in:inbox"),
        /**
         * How often to look. The old pattern missed a backslash and refused
         * any number of more than one digit, such as "15m"
         * (format.routine-mail-interval).
         */
        every: s
          .string()
          .regex(DURATION_PATTERN, 'use a number and a unit, e.g. "2m"')
          .default("2m"),
      })
      .strict(),
  })
  .strict();

/** When a routine starts. */
export const RoutineTrigger = s.union([
  ScheduleTrigger,
  EveryTrigger,
  ManualTrigger,
  SignalTrigger,
  MailTrigger,
]);

/** What a routine runs: a workflow with input, or one agent with a prompt. */
export const RoutineTarget = s.union([
  s
    .object({
      /** The workflow's hub. Required for workspace-level routines. */
      hub: id.optional(),
      workflow: id,
      /** Workflow input; text may use {{trigger.at}}, {{trigger.lastRun}} and {{trigger.message}}. */
      input: s.record(s.string(), s.unknown()).default({}),
    })
    .strict(),
  s
    .object({
      hub: id.optional(),
      agent: id,
      /** The prompt; it may use the same {{trigger.*}} templates. */
      prompt: s.string().min(1),
    })
    .strict(),
]);

/** `workflows/routines/<id>.routine.yaml`: when something runs on its own. */
export const Routine = s
  .object({
    version,
    id,
    name: s.string().min(1),
    description: s.string().optional(),
    enabled: s.boolean().default(true),
    trigger: RoutineTrigger,
    run: RoutineTarget,
    /** A previous run is still going: skip this one, queue it, or start anyway. */
    overlap: s.enum(["skip", "queue", "allow"]).default("skip"),
    /** Scheduled times missed while nothing ran: none, the last one, or all. */
    catchUp: s.enum(["none", "last", "all"]).default("last"),
  })
  .strict();

/** A routine, with defaults filled in. */
export type Routine = Infer<typeof Routine>;
/** When a routine starts. */
export type RoutineTrigger = Infer<typeof RoutineTrigger>;
/** What a routine runs. */
export type RoutineTarget = Infer<typeof RoutineTarget>;
