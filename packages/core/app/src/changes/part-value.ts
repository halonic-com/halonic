import { readYaml } from "@halonicjs/yaml";
import { type ItemPath, valueAt } from "./revert-parts.ts";

/** What an item's text holds at one part: nothing, or a value. */
export type PartValue =
  | { readonly found: false }
  | { readonly found: true; readonly value: unknown };

/**
 * Reads one part of an item's YAML text, so a screen can show an Important change as before →
 * after. A text that is missing or doesn't read has nothing at any part.
 *
 * @param text - the item's file text, or `null` if it wasn't there
 * @param part - a path from `ChangeLine.parts`
 *
 * @example
 * partValueIn("model: large\n", ["model"]); // { found: true, value: "large" }
 * partValueIn("model: large\n", ["tools"]); // { found: false }
 */
export function partValueIn(text: string | null, part: ItemPath): PartValue {
  if (text === null) return { found: false };
  const read = readYaml(text);
  if (!read.ok) return { found: false };
  const at = valueAt(read.value.data, part);
  return at.found ? { found: true, value: at.value } : { found: false };
}
