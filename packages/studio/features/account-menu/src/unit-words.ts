/**
 * What a customer reads for each unit, from the flows' Units table (HAL-12484, section 0), for
 * every screen that names a unit: the 80% banner and the inbox's plan-limit card. The cost unit
 * reads as "usage", a percentage only and never money: model cost is the seller's cost, not the
 * customer's price. Agent time has two keys: a plan stop names it `harnessMinutes` (the engine's
 * and Cloud's stops), the usage account's warnings `harnessMs`.
 */
const unitNames: ReadonlyMap<string, string> = new Map([
  ["runs", "runs"],
  ["steps", "steps"],
  ["tokens", "tokens"],
  ["harnessMinutes", "agent time"],
  ["harnessMs", "agent time"],
  ["cost", "usage"],
]);

/**
 * The name a customer reads for a unit, or `undefined` for one the flows don't name.
 *
 * @example
 * unitName("harnessMs"); // "agent time"
 */
export function unitName(unit: string): string | undefined {
  return unitNames.get(unit);
}
