import type { OutboundRules } from "./run-container-types.ts";

/** Where {@link outboundGate} sends a request it lets through. */
export interface OutboundRoutes {
  /** Sends a request for the bridge to Halonic's bridge route, outside the container. */
  bridge(request: Request): Promise<Response>;
  /** Sends a request for an allowed site out to the internet. */
  site(request: Request): Promise<Response>;
}

/**
 * Whether `host` is one of `allowedSites`: the same name, or for `*.name`,
 * any subdomain of it (not the name itself). Host names compare without case.
 */
export function siteAllowed(host: string, allowedSites: readonly string[]): boolean {
  const name = host.toLowerCase();
  return allowedSites.some((site) => {
    const pattern = site.toLowerCase();
    if (pattern.startsWith("*.")) {
      return name.endsWith(pattern.slice(1));
    }
    return name === pattern;
  });
}

/**
 * The handler for every request the container's intercepts catch. With
 * internet off, the platform already drops traffic no intercept names; this
 * checks the host again, as a second line, so a broad intercept can never
 * let through more than the rules allow.
 *
 * - plain HTTP to the bridge name, on the default port, goes to the bridge;
 * - HTTPS to an allowed site, on the default port, goes out;
 * - anything else gets 403 and goes nowhere.
 */
export function outboundGate(
  rules: OutboundRules,
  routes: OutboundRoutes,
): (request: Request) => Promise<Response> {
  return (request) => {
    const url = new URL(request.url);
    const onDefaultPort = url.port === "";
    if (url.protocol === "http:" && onDefaultPort && url.hostname === rules.bridgeHost) {
      return routes.bridge(request);
    }
    if (
      url.protocol === "https:" &&
      onDefaultPort &&
      siteAllowed(url.hostname, rules.allowedSites)
    ) {
      return routes.site(request);
    }
    return Promise.resolve(new Response("Blocked by the run's network rules.", { status: 403 }));
  };
}
