// The Network line of `halonic doctor` (HAL-14262): what the proxy setting
// this process was started with says, read with the same parsing every model
// call uses, and without any network call.

import type { ProxyFromEnv } from "@halonicjs/adapter-http-node";
import type { NetworkProblem } from "@halonicjs/app";

/**
 * The problem with the proxy setting, or `null` when there's no proxy or it
 * can be used: a proxy of another kind than `http` names its scheme, any
 * other refusal keeps the reason the setting gave.
 *
 * @example
 * networkProblemOf(proxyFromEnv({ HTTPS_PROXY: "https://proxy.corp:3129" }));
 * // { problem: "proxy-not-http", variable: "HTTPS_PROXY", scheme: "https" }
 */
export function networkProblemOf(setting: ProxyFromEnv): NetworkProblem | null {
  if (setting.kind !== "refused") return null;
  const { variable, scheme, message } = setting;
  return scheme === undefined
    ? { problem: "proxy-unusable", variable, reason: message }
    : { problem: "proxy-not-http", variable, scheme };
}
