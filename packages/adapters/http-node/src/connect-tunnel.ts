import * as http from "node:http";
import { isIP, type LookupFunction, type Socket } from "node:net";
import * as tls from "node:tls";
import type { ProxyEndpoint } from "./proxy-endpoint.ts";
import { ProxyError, type ProxyProblem } from "./proxy-error.ts";

/** The longest header block we read from the proxy's answer to CONNECT. */
const maxConnectHeaderBytes = 8 * 1024;

/** Where the tunnel leads, and what to check the certificate against. */
export interface TunnelTarget {
  /** The host name or IP address, without the brackets `URL` puts around IPv6. */
  readonly hostname: string;
  readonly port: number;
}

export interface TunnelOptions {
  readonly proxy: ProxyEndpoint;
  /** The variable the proxy came from, such as `HTTPS_PROXY`, for the errors to name. */
  readonly variable: string;
  /** Hands out the proxy's own address; the proxy is the user's, so it may be private. */
  readonly lookup: LookupFunction;
  readonly target: TunnelTarget;
  /** How long the proxy has to answer CONNECT and the handshake. The caller's `signal` still ends it sooner. */
  readonly connectTimeoutMs: number;
  readonly signal: AbortSignal | undefined;
}

/**
 * Opens a CONNECT tunnel through the proxy and runs TLS on it. The
 * certificate is checked for the target's name (or IP address) before this
 * returns, so no request byte leaves until the server has proved who it is.
 * A refused CONNECT, a proxy that answers with more than a 200, a lying
 * tunnel or a TLS failure is an error. There is no fallback to a direct
 * connection.
 *
 * @throws ProxyError when the proxy refuses or fails
 */
export async function openTunnel(options: TunnelOptions): Promise<tls.TLSSocket> {
  const fail = failing(options);
  // One clock covers CONNECT and the TLS handshake, so a proxy that answers
  // 200 and then goes silent can't hold the request for good.
  const timeout = new AbortController();
  const timer = setTimeout(() => {
    timeout.abort(
      fail(
        "timeout",
        `Your proxy ${options.proxy} didn't answer for ${options.target.hostname} in time.`,
      ),
    );
  }, options.connectTimeoutMs);
  const signal =
    options.signal === undefined
      ? timeout.signal
      : AbortSignal.any([options.signal, timeout.signal]);
  try {
    const socket = await connectThroughProxy(options, signal, fail);
    try {
      return await secure(socket, options.target, signal);
    } catch (error) {
      socket.destroy();
      throw error;
    }
  } catch (error) {
    // The caller's abort reads as that abort, the way it does on the direct path.
    if (signal.aborted) {
      throw signal.reason;
    }
    throw error instanceof ProxyError
      ? error
      : fail(
          "insecure",
          `The connection to ${options.target.hostname} through your proxy failed its ` +
            `security check: ${describe(error)}`,
        );
  } finally {
    clearTimeout(timer);
  }
}

/** A {@link ProxyError} for this tunnel, naming its proxy, variable and target host. */
type Fail = (problem: ProxyProblem, message: string, status?: number) => ProxyError;

function failing(options: TunnelOptions): Fail {
  const facts = {
    variable: options.variable,
    proxy: options.proxy.toString(),
    host: options.target.hostname,
  };
  return (problem, message, status) =>
    new ProxyError(message, problem, status === undefined ? facts : { ...facts, status });
}

function connectThroughProxy(
  options: TunnelOptions,
  signal: AbortSignal,
  fail: Fail,
): Promise<Socket> {
  const { proxy, target } = options;
  const authority = authorityOf(target, fail);
  const shown = target.hostname;
  return new Promise((resolve, reject) => {
    const proxyAuthorization = proxy.proxyAuthorization();
    const request = http.request({
      host: proxy.host.replace(/^\[|\]$/g, ""),
      port: proxy.port,
      method: "CONNECT",
      path: authority,
      headers: {
        host: authority,
        ...(proxyAuthorization === undefined ? {} : { "proxy-authorization": proxyAuthorization }),
      },
      lookup: options.lookup,
      agent: false,
      maxHeaderSize: maxConnectHeaderBytes,
      signal,
    });
    request.on("error", (error) => {
      reject(
        error instanceof ProxyError
          ? error
          : fail(
              "unreachable",
              `Could not reach your proxy ${proxy} for ${shown}: ${describe(error)}`,
            ),
      );
    });
    request.on("connect", (response, socket, head) => {
      const refusal = refusalOf(response.statusCode ?? 0, head, shown, fail);
      if (refusal !== undefined) {
        socket.destroy();
        reject(refusal);
        return;
      }
      resolve(socket);
    });
    request.end();
  });
}

/** Why the proxy's answer to CONNECT can't be used, or undefined when it is a clean 200. */
function refusalOf(
  status: number,
  head: Buffer,
  shown: string,
  fail: Fail,
): ProxyError | undefined {
  if (status === 407) {
    return fail("credentials", "Your proxy refused the user name and password.", status);
  }
  if (status !== 200) {
    return fail("refused", `Your proxy refused to connect to ${shown} (status ${status}).`, status);
  }
  if (head.length > 0) {
    return fail(
      "insecure",
      `Your proxy sent data before the connection to ${shown} was secure, so it was dropped.`,
    );
  }
  return undefined;
}

function secure(socket: Socket, target: TunnelTarget, signal: AbortSignal) {
  return new Promise<tls.TLSSocket>((resolve, reject) => {
    signal.throwIfAborted();
    // TLS takes no server name for an IP address (RFC 6066); with `host` set to
    // the address, the certificate is checked against its IP entry instead.
    const secured = tls.connect({
      socket,
      host: target.hostname,
      ...(isIP(target.hostname) === 0 ? { servername: target.hostname } : {}),
    });
    const onAbort = () => secured.destroy(signal.reason);
    signal.addEventListener("abort", onAbort, { once: true });
    secured.once("secureConnect", () => {
      signal.removeEventListener("abort", onAbort);
      resolve(secured);
    });
    secured.once("error", (error) => {
      signal.removeEventListener("abort", onAbort);
      reject(error);
    });
  });
}

/** `name:port`, with brackets for IPv6. A name that isn't a plain host never reaches the proxy. */
function authorityOf(target: TunnelTarget, fail: Fail): string {
  const isIpv6 = target.hostname.includes(":");
  const host = isIpv6 ? `[${target.hostname}]` : target.hostname;
  if (!/^(?:[a-z0-9._-]+|\[[0-9a-f:.]+\])$/i.test(host)) {
    throw fail(
      "bad-host",
      `${JSON.stringify(target.hostname)} is not a host name a proxy can be asked for.`,
    );
  }
  return `${host}:${target.port}`;
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
