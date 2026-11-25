// What a signal file is refused for beyond its schema. A signal decides what
// the plugin writes on its own, so these checks are part of the trust root
// (plan HAL-17450 rev 5, "Safety"): the builder and the plugin's loader run
// them again on every snapshot.
import type { KindCheckProblem } from "../../kind.ts";
import { checkKeysIn } from "../../shared/key-in-value.ts";
import type { Signal } from "./schema.ts";

/**
 * Checks a signal that passed its schema: `value-looks-like-key` for a key
 * written as its id or into any setting (`format.keys-in-values`); the
 * message never repeats it.
 *
 * @param signal - the parsed signal file
 * @returns every problem, all errors
 */
export function checkSignal(signal: Signal): KindCheckProblem[] {
  return [
    ...checkKeysIn(signal.id, ["id"], "setting"),
    ...checkKeysIn(signal.rule.with, ["rule", "with"], "setting"),
  ];
}
