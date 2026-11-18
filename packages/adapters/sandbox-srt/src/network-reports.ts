import type { SandboxBlock } from "@halonicjs/ports";

/** A network request srt's proxy refused, as the session reports it. */
export type NetworkBlock = Extract<SandboxBlock, { kind: "network" }>;

/**
 * The report fd our patch of srt's command line adds (`--report-fd`): srt
 * writes there, outside the fence, the violation line of each network request
 * its proxy refused. The program never gets it: srt puts `/dev/null` in its
 * place for the program (Linux and macOS), and on Windows passes the program
 * only its three standard streams.
 */
export const reportFd = 3;

/**
 * One of srt's violation lines for a refused request: `deny network-outbound`,
 * the host and port the program asked for, and srt's reason in brackets. srt
 * checks the host before it gets here, so it has no space; an IPv6 address
 * keeps its colons, so the port is the part after the last one.
 */
const refusedRequest = /^deny network-outbound (\S+):(\d{1,5}) \(/;

/**
 * The block one of srt's report lines names:
 * `deny network-outbound registry.npmjs.org:443 (host is not on the allow list)`
 * is `registry.npmjs.org` on port 443. Null for any other line, so a report
 * srt words differently is left out rather than shown wrong.
 */
export function parseNetworkReport(line: string): NetworkBlock | null {
  const match = refusedRequest.exec(line);
  if (match === null) return null;
  const [, host = "", portText = ""] = match;
  const port = Number(portText);
  return port <= 65_535 ? { kind: "network", host, port } : null;
}
