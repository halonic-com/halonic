// How the engine reads a meter's answer (requirement `engine.meter-checks`):
// it fails closed, so a meter that answers wrongly never lets usage through.

import type { MeterAnswer, PlanStop, ReserveAnswer } from "./meter.ts";
import { isPlanStop, noPlanStop } from "./plan-stops.ts";

/**
 * The stop in a meter's answer, or `null` when it allows. Only `allowed: true`
 * allows: an answer without a `plan.` stop, or one that isn't a meter's answer
 * at all, refuses with `plan.none`.
 */
export function stopOfAnswer(answer: MeterAnswer | ReserveAnswer | undefined): PlanStop | null {
  if (answer?.allowed === true) return null;
  const stop = answer?.stop;
  return stop !== undefined && isPlanStop(stop.cause) ? stop : noPlanStop();
}
