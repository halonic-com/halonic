/**
 * Why a request that has to go through the proxy couldn't:
 * - `setting`: the proxy variable isn't an `http://host:port` URL Halonic can use;
 * - `unreachable`: the proxy can't be found or doesn't take the connection;
 * - `timeout`: the proxy didn't answer in time;
 * - `refused`: the proxy turned down the tunnel to the host;
 * - `credentials`: the proxy turned down the user name and password (407);
 * - `plain-http`: the host is public and plain `http://`, which never goes through a proxy;
 * - `insecure`: the tunnel failed its security check, such as a certificate for another name;
 * - `bad-host`: the host isn't a name a proxy can be asked for.
 */
export type ProxyProblem =
  | "setting"
  | "unreachable"
  | "timeout"
  | "refused"
  | "credentials"
  | "plain-http"
  | "insecure"
  | "bad-host";

/**
 * What a proxy failure names, each without the proxy's user name or password:
 * the variable the setting came from, such as `HTTPS_PROXY`; the proxy as
 * `http://host:port`; the host the request was for; and the proxy's HTTP
 * status when it refused the tunnel.
 */
export interface ProxyFacts {
  readonly variable: string;
  readonly proxy?: string;
  readonly host?: string;
  readonly status?: number;
}

/** How a screen responds to each problem: the kit's error kind. */
const kindOf = {
  setting: "invalid_input",
  unreachable: "unavailable",
  timeout: "unavailable",
  refused: "denied",
  credentials: "unauthenticated",
  "plain-http": "denied",
  insecure: "denied",
  "bad-host": "invalid_input",
} as const satisfies Record<ProxyProblem, string>;

/**
 * Thrown when a request that has to go through the proxy can't: the proxy
 * setting is unusable, the proxy refused or dropped the tunnel, or the
 * request is one a proxy can't carry safely. The message says what to do and
 * never holds the proxy's user name or password. The request never goes
 * direct instead.
 *
 * It carries a `kind` and a `failureCause`, as the engine reads them from a
 * failed call (`failureCauseOf`): the code `proxy.<problem>` and the
 * {@link ProxyFacts} as strings. A model adapter passes them on, so the run
 * log can say it was the proxy.
 *
 * @example
 * throw new ProxyError("Your proxy refused the user name and password.", "credentials", {
 *   variable: "HTTPS_PROXY",
 *   proxy: "http://proxy.corp:3128",
 * });
 */
export class ProxyError extends Error {
  /** A stable code, so a caller can tell a proxy failure from a refused address. */
  readonly code = "proxy-failed";
  readonly problem: ProxyProblem;
  readonly kind: (typeof kindOf)[ProxyProblem];
  readonly failureCause: { readonly code: string; readonly detail: Record<string, string> };

  constructor(message: string, problem: ProxyProblem, facts: ProxyFacts) {
    super(message);
    this.name = "ProxyError";
    this.problem = problem;
    this.kind = kindOf[problem];
    this.failureCause = { code: `proxy.${problem}`, detail: detailOf(facts) };
  }
}

function detailOf(facts: ProxyFacts): Record<string, string> {
  return {
    variable: facts.variable,
    ...(facts.proxy === undefined ? {} : { proxy: facts.proxy }),
    ...(facts.host === undefined ? {} : { host: facts.host }),
    ...(facts.status === undefined ? {} : { status: String(facts.status) }),
  };
}
