import { NoProxy } from "./no-proxy.ts";
import { ProxyEndpoint } from "./proxy-endpoint.ts";

/** A proxy to send requests through, and the hosts that skip it. */
export interface ProxyConfig {
  readonly endpoint: ProxyEndpoint;
  readonly noProxy: NoProxy;
  /** The variable the proxy came from, `https_proxy` or `HTTPS_PROXY`, so an error can name it. */
  readonly variable: string;
}

/**
 * What the environment says about a proxy. `refused` is a proxy that is set
 * but unusable: the caller must fail every request that would use it with
 * the message and never go direct. `variable` names where it was set.
 */
export type ProxyFromEnv =
  | { readonly kind: "none" }
  | { readonly kind: "proxy"; readonly proxy: ProxyConfig }
  | { readonly kind: "refused"; readonly message: string; readonly variable: string };

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
  const set = firstSet(env, "https_proxy", "HTTPS_PROXY");
  if (set === undefined) {
    return { kind: "none" };
  }
  const parsed = ProxyEndpoint.parse(set.value);
  if (parsed.kind === "refused") {
    return { ...parsed, variable: set.name };
  }
  const noProxy = NoProxy.parse(firstSet(env, "no_proxy", "NO_PROXY")?.value);
  return { kind: "proxy", proxy: { endpoint: parsed.endpoint, noProxy, variable: set.name } };
}

/** The first of `names` that is set to something other than spaces, with its value trimmed. */
function firstSet(
  env: Readonly<Record<string, string | undefined>>,
  ...names: string[]
): { name: string; value: string } | undefined {
  for (const name of names) {
    const value = env[name]?.trim();
    if (value !== undefined && value !== "") {
      return { name, value };
    }
  }
  return undefined;
}
