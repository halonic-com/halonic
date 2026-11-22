import type { RoutineTrigger as FileTrigger } from "@halonicjs/format";
import { describeTrigger } from "@halonicjs/routines";
import type { RoutineTrigger } from "../api.ts";
import { defaultTrigger, PICKABLE_KINDS, type PickableKind } from "./trigger-values.ts";

/**
 * The sentence each Trigger option would write, for the second line of the phone's picker sheet
 * (flow-routines 5.3): the routine's own sentence for the kind it is on, and for every other kind
 * the sentence of what picking it writes, in core's words: "Weekdays at 08:00", "Every hour (UTC)".
 */
export function optionSentence(
  kind: RoutineTrigger["kind"],
  current: { readonly trigger: RoutineTrigger; readonly sentence: string },
  deviceZone: string | undefined,
): string | undefined {
  if (kind === current.trigger.kind) return current.sentence;
  // A kind that isn't pickable is only ever the routine's own, so it has its sentence above.
  if (!isPickable(kind)) return undefined;
  return describeTrigger(fileTriggerOf(defaultTrigger(kind, deviceZone)));
}

function isPickable(kind: RoutineTrigger["kind"]): kind is PickableKind {
  return (PICKABLE_KINDS as readonly string[]).includes(kind);
}

/**
 * A picked kind's default in the file's shape, which core describes. Only the pickable kinds'
 * defaults come here, so mail and web requests never do.
 */
function fileTriggerOf(trigger: RoutineTrigger): FileTrigger {
  switch (trigger.kind) {
    case "manual":
      return { manual: true };
    case "schedule":
      return {
        schedule: trigger.cron,
        ...(trigger.timeZone !== undefined && { timezone: trigger.timeZone }),
      };
    case "every":
      return { every: trigger.interval };
    case "signal":
      return { signal: { name: trigger.name } };
    case "mail":
    case "webhook":
      throw new Error(`A ${trigger.kind} trigger is never a picked default.`);
  }
}
