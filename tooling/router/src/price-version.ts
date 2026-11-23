import { createHash } from "node:crypto";
import type { ModelAlias } from "@halonicjs/format";

/** How many hex digits of the hash the price version keeps: enough to tell versions apart, short enough to read. */
const versionDigits = 12;

/**
 * The catalog's price version (Q4): a hash of each alias's provider, model and
 * price, in alias order. Order of keys in the file, comments and descriptions
 * don't change it; any price, or a different model behind an alias, does.
 *
 * @example
 * priceVersionOf(aliases); // "prices-3f9a0c1b2d4e"
 */
export function priceVersionOf(aliases: Readonly<Record<string, ModelAlias>>): string {
  const table = Object.keys(aliases)
    .sort()
    .map((name) => {
      const alias = aliases[name];
      return [name, alias?.provider, alias?.model, priceRow(alias)];
    });
  const digest = createHash("sha256").update(JSON.stringify(table)).digest("hex");
  return `prices-${digest.slice(0, versionDigits)}`;
}

/** The price as a fixed list, so the hash doesn't depend on key order. */
function priceRow(alias: ModelAlias | undefined): (number | null)[] {
  const price = alias?.price;
  return [
    price?.input ?? null,
    price?.output ?? null,
    price?.cacheRead ?? null,
    price?.cacheWrite ?? null,
    price?.cacheWrite1h ?? null,
  ];
}
