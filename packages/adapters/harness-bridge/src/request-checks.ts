import type { IncomingMessage } from "node:http";
import type { BridgeRefusal } from "./bridge-error.ts";

/**
 * The requests the bridge turns away before it checks the run token. The
 * token already keeps both out; these checks are defence in depth, as on the
 * agent host's own port.
 */
export const refusals = {
  /** A web page that points its own domain at 127.0.0.1 (DNS rebinding), or a request for another host. */
  wrongHost: {
    status: 421,
    kind: "invalid_input",
    message: "The Halonic bridge answers only requests addressed to it.",
  },
  /** A request from a web page: the harness programs aren't browsers, so the bridge has no CORS. */
  browserOrigin: {
    status: 403,
    kind: "denied",
    message: "The Halonic bridge doesn't answer requests from web pages.",
  },
} as const satisfies Record<string, BridgeRefusal>;

/**
 * Why the bridge turns a request away before it checks the token, or
 * `undefined` when it doesn't. The `Host` header must be one of `hosts`. A
 * request target in absolute form, as a proxy sends it
 * (`http://bridge.halonic.invalid/v1/messages`), must name one of them too.
 */
export function refusalOf(
  request: IncomingMessage,
  hosts: ReadonlySet<string>,
): BridgeRefusal | undefined {
  const host = request.headers.host?.toLowerCase();
  if (host === undefined || !hosts.has(host)) return refusals.wrongHost;
  if (!targetNamesBridge(request.url ?? "/", hosts)) return refusals.wrongHost;
  if (request.headers.origin !== undefined) return refusals.browserOrigin;
  return undefined;
}

/**
 * Why the bridge turns a `CONNECT` away, or `undefined` when it opens the
 * tunnel: the target must be `tunnelTarget` exactly, and the `Host` and
 * `Origin` checks are those of any request.
 */
export function connectRefusalOf(
  request: IncomingMessage,
  hosts: ReadonlySet<string>,
  tunnelTarget: string,
): BridgeRefusal | undefined {
  if (request.url?.toLowerCase() !== tunnelTarget) return refusals.wrongHost;
  const host = request.headers.host?.toLowerCase();
  if (host === undefined || !hosts.has(host)) return refusals.wrongHost;
  if (request.headers.origin !== undefined) return refusals.browserOrigin;
  return undefined;
}

/**
 * Whether a request target is a path, or an absolute `http:` URL whose host
 * names the bridge. A target starting with `//` names a host of its own, as a
 * URL does, so it isn't taken as a path.
 */
function targetNamesBridge(target: string, hosts: ReadonlySet<string>): boolean {
  if (target.startsWith("/") && !target.startsWith("//")) return true;
  if (!URL.canParse(target)) return false;
  // `URL` drops port 80 and lowers the case, as the `Host` values are written.
  const url = new URL(target);
  return url.protocol === "http:" && hosts.has(url.host);
}
