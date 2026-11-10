import {
  createServer,
  type IncomingHttpHeaders,
  type IncomingMessage,
  request,
  type ServerResponse,
} from "node:http";
import type { AddressInfo } from "node:net";

/**
 * One request the tap passed on: what a check may print about it. It holds
 * header names and whether each was sent, never a header's value.
 */
export interface TappedRequest {
  method: string;
  /** The path without its query, which can hold anything. */
  path: string;
  /** For each watched header name, in lower case: whether the request carried it. */
  headers: Record<string, "present" | "absent">;
  /** The status the bridge answered with, or `null` when it never answered. */
  status: number | null;
}

/** An open tap: the loopback address the sandbox allows, and what passed through it so far. */
export interface HeaderTap {
  host: string;
  port: number;
  /** `http://<host>:<port>`: what the harness gets as the bridge's address. */
  url: string;
  /** The requests so far, in the order they arrived. */
  readonly requests: readonly TappedRequest[];
  close(): Promise<void>;
}

/** What {@link openHeaderTap} needs. */
export interface HeaderTapOptions {
  /** The real bridge's address, such as `http://127.0.0.1:41817`. */
  bridgeUrl: string;
  /** The header names to report as present or absent, such as `authorization`. */
  watched: readonly string[];
}

/**
 * Opens a loopback server that stands in front of the bridge (requirement
 * `harness-checks.header-tap`). Each request goes on to the bridge
 * unchanged, body and headers included, and the bridge's answer comes back
 * unchanged, streaming included. The tap keeps only the method, the path
 * without its query, whether each watched header was there, and the
 * status: never a value, so a sign-in can't reach a report.
 *
 * @example
 * const tap = await openHeaderTap({ bridgeUrl: bridge.url, watched: ["authorization"] });
 * // ... point the harness at tap.url ...
 * tap.requests; // [{ method: "POST", path: "/v1/messages", headers: { authorization: "present" }, status: 200 }]
 * await tap.close();
 */
export async function openHeaderTap(options: HeaderTapOptions): Promise<HeaderTap> {
  const bridge = new URL(options.bridgeUrl);
  const watched = options.watched.map((name) => name.toLowerCase());
  const requests: TappedRequest[] = [];
  const server = createServer((incoming, outgoing) => {
    const tapped: TappedRequest = {
      method: incoming.method ?? "GET",
      path: pathWithoutQuery(incoming.url ?? "/"),
      headers: headerPresence(incoming.headers, watched),
      status: null,
    };
    requests.push(tapped);
    passOn(incoming, outgoing, bridge, tapped);
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const { address, port } = server.address() as AddressInfo;
  return {
    host: address,
    port,
    url: `http://${address}:${port}`,
    requests,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}

/** Sends one request on to the bridge and its answer back, and notes the status. */
function passOn(
  incoming: IncomingMessage,
  outgoing: ServerResponse,
  bridge: URL,
  tapped: TappedRequest,
): void {
  const onward = request(
    {
      host: bridge.hostname,
      port: bridge.port,
      method: incoming.method,
      path: incoming.url,
      headers: { ...incoming.headers, host: bridge.host },
    },
    (answer) => {
      tapped.status = answer.statusCode ?? null;
      outgoing.writeHead(answer.statusCode ?? 502, answer.headers);
      answer.pipe(outgoing);
    },
  );
  onward.on("error", () => {
    // The bridge's own error text could hold anything, so only the fact goes back.
    if (!outgoing.headersSent) outgoing.writeHead(502);
    outgoing.end();
  });
  outgoing.on("close", () => onward.destroy());
  incoming.pipe(onward);
}

/** Whether each watched header was sent; its value is never read. */
function headerPresence(
  headers: IncomingHttpHeaders,
  watched: readonly string[],
): Record<string, "present" | "absent"> {
  const presence: Record<string, "present" | "absent"> = {};
  for (const name of watched) presence[name] = headers[name] === undefined ? "absent" : "present";
  return presence;
}

/**
 * The path part of a request target, without its query.
 *
 * @example
 * pathWithoutQuery("/v1/messages?beta=true"); // "/v1/messages"
 */
export function pathWithoutQuery(target: string): string {
  const end = target.search(/[?#]/);
  return end === -1 ? target : target.slice(0, end);
}
