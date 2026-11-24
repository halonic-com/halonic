// The host pins a harness agent's bridge may move a model call on to
// (requirement `harness-host.bridge-fallback`, HAL-17315). Within a run the
// bridge may change only the OpenRouter host of the same model, behind the
// same key and address (HAL-16992, Q3), so the host offers only fallbacks
// that keep all three and keep the data at least as safe. The bridge checks
// the data terms and the cap again (`harness-bridge.host-fallback`).

import {
  type BridgeFallbackHop,
  bridgeRouting,
  keepsDataTerms,
  maxBridgeFallbacks,
  type ProviderRouting,
} from "@halonicjs/ports";
import type { ResolvedModelTarget } from "@halonicjs/workspace";

/** The one host whose calls the bridge moves on between pins: OpenRouter's API, by its exact host. */
const openRouterHost = "openrouter.ai";

/** What a keyed access names for the bridge's fallback: the alias the run starts on, and its hops. */
export interface BridgeFallbackSettings {
  readonly alias: string;
  readonly fallbacks?: readonly BridgeFallbackHop[];
}

/**
 * The alias a keyed access starts on and the host pins it may move on to,
 * in the order of the alias's `fallback` list. Only for an alias whose own
 * provider holds the key (`pinned`, as for its `routing`) and whose address
 * is exactly `openrouter.ai`; `undefined` for any other access.
 *
 * A fallback entry becomes a hop only when it names the same provider file
 * and the same model, and its pin keeps the data at least as safe as the
 * first one's ({@link keepsDataTerms}); at most {@link maxBridgeFallbacks}
 * of them. A hop carries only its alias and its pin: the bridge sends the
 * same request on it, so the entry's other params don't go along.
 *
 * @example
 * fallbackSettingsOf(target, true, "https://openrouter.ai/api");
 * // { alias: "fast", fallbacks: [{ alias: "fast-backup", routing: { order: ["acme-host/fp8"], data_collection: "deny" } }] }
 */
export function fallbackSettingsOf(
  target: ResolvedModelTarget | undefined,
  pinned: boolean,
  baseUrl: string | undefined,
): BridgeFallbackSettings | undefined {
  if (!pinned || target?.alias === undefined || !isOpenRouter(baseUrl)) return undefined;
  const first = routingOfTarget(target);
  const fallbacks = target.fallback
    .flatMap((entry): BridgeFallbackHop[] => {
      if (entry.alias === undefined) return [];
      if (entry.provider !== target.provider || entry.model !== target.model) return [];
      const routing = routingOfTarget(entry);
      return keepsDataTerms(first, routing) ? [{ alias: entry.alias, routing }] : [];
    })
    .slice(0, maxBridgeFallbacks);
  return fallbacks.length === 0 ? { alias: target.alias } : { alias: target.alias, fallbacks };
}

/**
 * The alias's OpenRouter host pin, with only OpenRouter's routing keys; `{}`
 * when it sets none, which is what the bridge compares an unpinned first
 * call by too.
 */
function routingOfTarget(target: ResolvedModelTarget["fallback"][number]): ProviderRouting {
  const routing = target.params.extra?.provider;
  return routing === undefined ? {} : bridgeRouting(routing);
}

/** True when the address's host is exactly OpenRouter's: no other port, subdomain or look-alike. */
function isOpenRouter(baseUrl: string | undefined): boolean {
  return baseUrl !== undefined && URL.canParse(baseUrl) && new URL(baseUrl).host === openRouterHost;
}
