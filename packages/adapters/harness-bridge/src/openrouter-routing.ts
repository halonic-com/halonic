import type { ProviderRouting } from "@halonicjs/events";
import { type BridgeProviderAccess, bridgeRouting } from "@halonicjs/ports";
import { isPlainObject } from "@halonicjs/std";

/** The one host whose calls get the alias's routing: OpenRouter's API, by its exact host. */
const openRouterHost = "openrouter.ai";

/**
 * The routing the bridge sends with each call on `access` (requirement
 * `harness-bridge.openrouter-routing`): the alias's host pin the host gave,
 * for a key whose `baseUrl` host is exactly `openrouter.ai`, with only
 * OpenRouter's routing keys. `undefined` for any other access, so a pin
 * never goes to another host, where `provider` could mean something else.
 */
export function routingFor(access: BridgeProviderAccess): ProviderRouting | undefined {
  if (access.kind !== "key" || access.routing === undefined) return undefined;
  if (access.baseUrl === undefined || !isOpenRouter(access.baseUrl)) return undefined;
  return bridgeRouting(access.routing);
}

/**
 * The request with `routing` as its `provider`, in place of whatever the
 * request held. A compatible provider's request with a `provider` of the
 * program's own was refused before this, so the program can never choose
 * the hosts itself. Without a routing, the request comes back as it was.
 */
export function withRouting(request: unknown, routing: ProviderRouting | undefined): unknown {
  if (routing === undefined || !isPlainObject(request)) return request;
  return { ...request, provider: routing };
}

/** True when the address's host is exactly OpenRouter's: no other port, subdomain or look-alike. */
function isOpenRouter(baseUrl: string): boolean {
  return URL.canParse(baseUrl) && new URL(baseUrl).host === openRouterHost;
}
