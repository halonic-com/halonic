import { NoProxy } from "./no-proxy.ts";
import { ProxyEndpoint } from "./proxy-endpoint.ts";

/** A proxy to send requests through, and the hosts that skip it. */
export interface ProxyConfig {
  readonly endpoint: ProxyEndpoint;
  readonly noProxy: NoProxy;
}

/**
 * What the environment says about a proxy. `refused` is a proxy that is set
 * but unusable: the caller must fail every request that would use it with
 * the message and never go direct.
 */
export type ProxyFromEnv =
  | { readonly kind: "none" }
  | { readonly kind: "proxy"; readonly proxy: ProxyConfig }
  | { readonly kind: "refused"; readonly message: string };

/**
 * Reads `HTTPS_PROXY` and `NO_PROXY` once, for the app to pass to the
 * client. The lower-case name wins, as in curl. An empty value counts as not
 * set, so `https_proxy=` switches a proxy off for one shell and falls back to
 * `HTTPS_PROXY`. `HTTP_PROXY` is not read: only `https` is tunnelled.
 *
 * @example
 * const setting = proxyFromEnv(process.env);
 * if (setting.kind === "proxy") {
 *   console.log(`Using the proxy ${setting.proxy.endpoint}`);
 * }
 */
export function proxyFromEnv(env: Readonly<Record<string, string | undefined>>): ProxyFromEnv {
  const value = firstSet(env, "https_proxy", "HTTPS_PROXY");
  if (value === undefined) {
    return { kind: "none" };
  }
  const parsed = ProxyEndpoint.parse(value);
  if (parsed.kind === "refused") {
    return parsed;
  }
  const noProxy = NoProxy.parse(firstSet(env, "no_proxy", "NO_PROXY"));
  return { kind: "proxy", proxy: { endpoint: parsed.endpoint, noProxy } };
}

function firstSet(
  env: Readonly<Record<string, string | undefined>>,
  ...names: string[]
): string | undefined {
  for (const name of names) {
    const value = env[name]?.trim();
    if (value !== undefined && value !== "") {
      return value;
    }
  }
  return undefined;
}
