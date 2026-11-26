import { type ActionKeptValue, maxActionValueLength } from "@halonicjs/events";

/**
 * Cuts every kept text to the length an action event may hold, so a long
 * value a service sent back can't make the event fail its check after the
 * step already ran (review of #5659 on HAL-17517). The stepper calls this
 * before it builds `action.step.succeeded`; numbers, booleans and `null` pass
 * unchanged.
 *
 * @example
 * capKeptValues({ id: "x".repeat(1200), count: 3 });
 * // => { id: "xxx…" (1000 characters), count: 3 }
 */
export function capKeptValues(
  kept: Readonly<Record<string, ActionKeptValue>>,
): Record<string, ActionKeptValue> {
  const capped: Record<string, ActionKeptValue> = {};
  for (const [name, value] of Object.entries(kept)) {
    capped[name] = typeof value === "string" ? cutText(value) : value;
  }
  return capped;
}

/** Cuts by code point, so a cut never leaves half of a surrogate pair. */
function cutText(value: string): string {
  if (value.length <= maxActionValueLength) return value;
  let cut = "";
  for (const character of value) {
    if (cut.length + character.length > maxActionValueLength) break;
    cut += character;
  }
  return cut;
}
