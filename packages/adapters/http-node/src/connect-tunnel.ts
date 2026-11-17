import * as http from "node:http";
import { isIP, type LookupFunction, type Socket } from "node:net";
import * as tls from "node:tls";
import type { ProxyEndpoint } from "./proxy-endpoint.ts";
import { ProxyError } from "./proxy-error.ts";

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
  /** Hands out the proxy's own address; the proxy is the user's, so it may be private. */
  readonly lookup: LookupFunction;
  readonly target: TunnelTarget;
  /** How long the proxy has to answer CONNECT. The caller's `signal` still ends it sooner. */
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
  const socket = await connectThroughProxy(options);
  try {
    return await secure(socket, options.target, options.signal);
  } catch (error) {
    socket.destroy();
    throw error instanceof ProxyError
      ? error
      : new ProxyError(
          `The connection to ${options.target.hostname} through your proxy failed its ` +
            `security check: ${describe(error)}`,
        );
  }
}

function connectThroughProxy(options: TunnelOptions): Promise<Socket> {
  const { proxy, target } = options;
  const authority = authorityOf(target);
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
      signal: options.signal,
    });
    const timer = setTimeout(() => {
      request.destroy(new ProxyError(`Your proxy ${proxy} didn't answer for ${shown} in time.`));
    }, options.connectTimeoutMs);
    request.on("error", (error) => {
      clearTimeout(timer);
      reject(
        error instanceof ProxyError
          ? error
          : new ProxyError(`Could not reach your proxy ${proxy} for ${shown}: ${describe(error)}`),
      );
    });
    request.on("connect", (response, socket, head) => {
      clearTimeout(timer);
      const refusal = refusalOf(response.statusCode ?? 0, head, shown);
      if (refusal !== undefined) {
        socket.destroy();
        reject(new ProxyError(refusal));
        return;
      }
      resolve(socket);
    });
    request.end();
  });
}

/** Why the proxy's answer to CONNECT can't be used, or undefined when it is a clean 200. */
function refusalOf(status: number, head: Buffer, shown: string): string | undefined {
  if (status === 407) {
    return "Your proxy refused the user name and password.";
  }
  if (status !== 200) {
    return `Your proxy refused to connect to ${shown} (status ${status}).`;
  }
  if (head.length > 0) {
    return `Your proxy sent data before the connection to ${shown} was secure, so it was dropped.`;
  }
  return undefined;
}

function secure(socket: Socket, target: TunnelTarget, signal: AbortSignal | undefined) {
  return new Promise<tls.TLSSocket>((resolve, reject) => {
    // TLS takes no server name for an IP address (RFC 6066); with `host` set to
    // the address, the certificate is checked against its IP entry instead.
    const secured = tls.connect({
      socket,
      host: target.hostname,
      ...(isIP(target.hostname) === 0 ? { servername: target.hostname } : {}),
    });
    const onAbort = () => secured.destroy(signal?.reason);
    signal?.addEventListener("abort", onAbort, { once: true });
    secured.once("secureConnect", () => {
      signal?.removeEventListener("abort", onAbort);
      resolve(secured);
    });
    secured.once("error", (error) => {
      signal?.removeEventListener("abort", onAbort);
      reject(error);
    });
  });
}

/** `name:port`, with brackets for IPv6. A name that isn't a plain host never reaches the proxy. */
function authorityOf(target: TunnelTarget): string {
  const isIpv6 = target.hostname.includes(":");
  const host = isIpv6 ? `[${target.hostname}]` : target.hostname;
  if (!/^(?:[a-z0-9._-]+|\[[0-9a-f:.]+\])$/i.test(host)) {
    throw new ProxyError(
      `${JSON.stringify(target.hostname)} is not a host name a proxy can be asked for.`,
    );
  }
  return `${host}:${target.port}`;
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
