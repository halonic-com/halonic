import { isIP } from "node:net";
import type { SandboxBlock } from "@halonicjs/ports";

/** A network request srt's proxy refused, as the session reports it. */
export type NetworkBlock = Extract<SandboxBlock, { kind: "network" }>;

/**
 * The report fd our patch of srt's command line adds (`--report-fd`): srt
 * writes there, outside the fence, the violation line of each network request
 * its proxy refused. On Linux and macOS the program never gets it: srt puts
 * `/dev/null` in its place. On Windows srt's inheritable pipe handle reaches
 * the program, unnamed, and a program that guesses its value can write to it,
 * so every line read from it is untrusted (see {@link parseNetworkReport}).
 */
export const reportFd = 3;

/**
 * The longest report line kept, in bytes. srt's own lines are far shorter (a
 * host has at most 255 characters); a longer line is dropped whole, so a
 * program that writes to the pipe can't grow the host's memory.
 */
export const maxReportLineBytes = 1024;

/** The longest host srt lets through its proxy, as its `isValidHost` checks. */
const maxHostLength = 255;

/**
 * One of srt's violation lines for a refused request: `deny network-outbound`,
 * the host and port the program asked for, and srt's reason in brackets. The
 * host is checked on its own (see {@link isHostSrtAccepts}); an IPv6 address
 * keeps its colons, so the port is the part after the last one.
 */
const refusedRequest = /^deny network-outbound (\S+):(\d{1,5}) \(/;

/**
 * The block one of srt's report lines names:
 * `deny network-outbound registry.npmjs.org:443 (host is not on the allow list)`
 * is `registry.npmjs.org` on port 443. Null for any other line, so a report
 * srt words differently is left out rather than shown wrong.
 *
 * On Windows the program can write to the report pipe, so the line is read as
 * untrusted: only a host srt itself would let through its proxy and a port a
 * request can have make a block. A forged line can still name a site that was
 * never asked for, but only as a host and port, never as text the panel shows
 * unchecked.
 */
export function parseNetworkReport(line: string): NetworkBlock | null {
  const match = refusedRequest.exec(line);
  if (match === null) return null;
  const [, host = "", portText = ""] = match;
  const port = Number(portText);
  if (port < 1 || port > 65_535) return null;
  return isHostSrtAccepts(host) ? { kind: "network", host, port } : null;
}

/**
 * Whether srt's proxy would accept `host`, the same check as srt's own
 * `isValidHost`: at most 255 characters, brackets allowed around an IPv6
 * address, no zone id, and either an IP address or only the characters of a
 * DNS name (letters, digits, `.`, `_` and `-`).
 */
function isHostSrtAccepts(host: string): boolean {
  if (host.length === 0 || host.length > maxHostLength) return false;
  const bare = host.startsWith("[") && host.endsWith("]") ? host.slice(1, -1) : host;
  if (bare.includes("%")) return false;
  return isIP(bare) !== 0 || /^[A-Za-z0-9._-]+$/.test(bare);
}
