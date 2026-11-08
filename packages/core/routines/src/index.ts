/** The npm name of this package. A placeholder export, so the empty package has an API to test. */
export const packageName = "@halonicjs/routines";

export { CronError } from "./cron-error.ts";
export { describeCron } from "./describe-cron.ts";
export { describeTrigger } from "./describe-trigger.ts";
export {
  DEFAULT_TICK_POLICY,
  type DueRun,
  due,
  type PlacedRoutine,
  routineKey,
  type TickPolicy,
} from "./due.ts";
export { MAIL_OVERLAP_MS, mailCheckDue, mailQuery } from "./mail-trigger.ts";
export { nextCronTime } from "./next-cron-time.ts";
export { nextRun } from "./next-run.ts";
export { occurrences } from "./occurrences.ts";
export { type Cron, parseCron } from "./parse-cron.ts";
export { parseEvery } from "./parse-every.ts";
export {
  type RoutineStart,
  routineStart,
  type TriggerFacts,
} from "./routine-start.ts";
export { checkTimeZone, type WallTime, wallTime } from "./time-zone.ts";
export { triggerError } from "./trigger-error.ts";
export { type TriggerKind, triggerKind } from "./trigger-kind.ts";
