import type { RoutineTrigger } from "@halonicjs/format";

/** The six ways a routine can start. */
export type TriggerKind = "schedule" | "every" | "manual" | "mail" | "signal" | "webhook";

/**
 * Which of the six kinds a trigger is, from the one key it has.
 *
 * @example
 * triggerKind({ every: "15m" }); // "every"
 * triggerKind({ manual: true }); // "manual"
 */
export function triggerKind(trigger: RoutineTrigger): TriggerKind {
  if ("schedule" in trigger) return "schedule";
  if ("every" in trigger) return "every";
  if ("mail" in trigger) return "mail";
  if ("signal" in trigger) return "signal";
  if ("webhook" in trigger) return "webhook";
  return "manual";
}
