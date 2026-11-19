// Reads a proxy failure from the cause the engine logged on `run.failed`
// (requirement `http-node.proxy-failure-cause`): a `model-unreachable` run
// whose cause is the proxy, not the network (HAL-12606). The facts are data;
// the CLI and Studio word them.

import type { RunFailureCause } from "@halonicjs/events";

/**
 * What went wrong with the proxy, from the code of `run.failed`'s cause
 * (`proxy.<problem>`), with the facts each problem's lines name. A code the
 * app doesn't know, or one without the facts its lines need, is `other`.
 */
export type ProxyProblem =
  | { readonly problem: "setting" }
  | {
      readonly problem: "unreachable" | "timeout" | "credentials";
      /** The proxy as `http://host:port`, never with its user name or password. */
      readonly proxy: string;
    }
  | { readonly problem: "refused" | "insecure"; readonly proxy: string; readonly host: string }
  | { readonly problem: "plain-http"; readonly host: string }
  | { readonly problem: "other" };

/** A `model-unreachable` run whose cause is the proxy: its lines name the proxy and the one fix for it. */
export type ProxyFailure = {
  readonly reason: "proxy-failed";
  /** The provider as its file names it, such as "OpenAI", or else its id. */
  readonly provider: string;
  /** The variable the proxy came from, such as `HTTPS_PROXY`. */
  readonly variable: string;
} & ProxyProblem;

/**
 * `model-unreachable` because of the proxy: the cause the engine logged has a
 * `proxy.` code, so the network was never the problem and "check your
 * internet connection" would mislead.
 *
 * @param provider - the provider of the model the run called last
 * @returns `undefined` when the cause isn't the proxy's
 */
export function proxyFailureOf(
  cause: RunFailureCause | undefined,
  provider: string,
): ProxyFailure | undefined {
  const code = cause?.code;
  if (code === undefined || !code.startsWith("proxy.")) {
    return undefined;
  }
  const detail = cause?.detail ?? {};
  return {
    reason: "proxy-failed",
    provider,
    // Every proxy failure names its variable; a log without one still says which setting to check.
    variable: detail["variable"] ?? "HTTPS_PROXY",
    ...proxyProblemOf(code.slice("proxy.".length), detail),
  };
}

/** The problem a `proxy.<problem>` code names, with its facts; `other` when a fact its lines need is missing. */
function proxyProblemOf(problem: string, detail: Readonly<Record<string, string>>): ProxyProblem {
  const { proxy, host } = detail;
  switch (problem) {
    case "setting":
      return { problem };
    case "unreachable":
    case "timeout":
    case "credentials":
      return proxy === undefined ? { problem: "other" } : { problem, proxy };
    case "refused":
    case "insecure":
      return proxy === undefined || host === undefined
        ? { problem: "other" }
        : { problem, proxy, host };
    case "plain-http":
      return host === undefined ? { problem: "other" } : { problem, host };
    default:
      return { problem: "other" };
  }
}
