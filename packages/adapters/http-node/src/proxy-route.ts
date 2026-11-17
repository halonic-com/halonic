import type { HostClass } from "@halonicjs/adapter-http-kit";
import { ProxyError } from "./proxy-error.ts";
import type { ProxyConfig, ProxyFromEnv } from "./proxy-from-env.ts";

/** How one request, or one redirect hop, reaches its host. */
export type Route =
  | { readonly kind: "direct" }
  | { readonly kind: "tunnel"; readonly proxy: ProxyConfig };

/**
 * Decides, by the host's name and class, whether a request goes through the
 * proxy (proxy design, section 2.4). The address check can't run through a
 * proxy, so what stays is the class by name, `https` only, and the
 * certificate for the name.
 *
 * - A `loopback` or `private` host is always direct, with the full address
 *   check. Sending a home-network name to a company proxy would leak it.
 * - A host on `NO_PROXY` is direct, with the full address check.
 * - Anything else public goes through a CONNECT tunnel, or fails: a plain
 *   `http://` request, or an unusable proxy setting, is refused. Neither is
 *   ever sent direct, because that would walk around the company's egress
 *   rules.
 *
 * @throws ProxyError when the request needs the proxy and can't use it
 */
export function routeFor(url: URL, hostClass: HostClass, setting: ProxyFromEnv): Route {
  if (setting.kind === "none" || hostClass === "loopback" || hostClass === "private") {
    return { kind: "direct" };
  }
  if (setting.kind === "refused") {
    throw new ProxyError(`${setting.message} Nothing was sent to ${url.host}.`);
  }
  if (setting.proxy.noProxy.matches(url)) {
    return { kind: "direct" };
  }
  if (url.protocol !== "https:") {
    throw new ProxyError(
      `${url.host} uses plain http and a proxy is set, so nothing was sent. ` +
        "Use https://, or add the host to NO_PROXY.",
    );
  }
  return { kind: "tunnel", proxy: setting.proxy };
}
