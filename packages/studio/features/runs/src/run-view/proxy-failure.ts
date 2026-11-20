// A proxy failure, read from a failed run's typed cause (requirements
// `runs.run-view.failure-banners`, `http-node.proxy-failure-cause`). Only `cause` is read, as
// the CLI reads it (`cli.run-failed-proxy`): a run without a `proxy.` code keeps the
// `model-unreachable` banner that says to check the internet connection.

import type { RunSummary } from "@halonicjs/events";

/**
 * What went wrong with the proxy, from the cause's code (`proxy.<problem>`), with the facts each
 * problem's lines name. A code Studio doesn't know, or one without the facts its lines need, is
 * `other`.
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

/** A run the proxy failed: the variable the proxy came from, and what it did. */
export type ProxyFailure = {
  /** The variable the proxy came from, such as `HTTPS_PROXY`. */
  readonly variable: string;
} & ProxyProblem;

/** The prefix of every code the proxy's failures carry. */
const proxyCodePrefix = "proxy.";

/**
 * The proxy failure the run's cause names, or `undefined` for a run whose cause isn't the proxy's.
 *
 * @example
 * proxyFailureOf(failedRun); // { variable: "HTTPS_PROXY", problem: "refused", proxy: "http://127.0.0.1:3128", host: "api.openai.com" }
 */
export function proxyFailureOf(summary: RunSummary): ProxyFailure | undefined {
  const code = summary.cause?.code;
  if (summary.status !== "failed" || code === undefined || !code.startsWith(proxyCodePrefix)) {
    return undefined;
  }
  const detail = summary.cause?.detail ?? {};
  return {
    // Every proxy failure names its variable; a log without one still says which setting to check.
    variable: detail["variable"] ?? "HTTPS_PROXY",
    ...proxyProblemOf(code.slice(proxyCodePrefix.length), detail),
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
