// The local network half of the probes: addresses of the network this
// computer is on, other than its own, that the box must not reach: the
// router's usual address and one address in each private range the computer
// is on (RFC 1918 for IPv4, fc00::/7 for IPv6).
//
// Nothing listens on these, so nothing here opens a port on the person's
// computer and no firewall dialog can appear (HAL-8306). A connection that
// connects proves a leak. A refusal or a silence is read like every other
// network probe (`network-probes.ts`).
//
// The router's address is a guess: the first usable address of the subnet,
// where routers almost always are. Reading the real default gateway needs a
// process start (`route print`), which is a reviewed entry in
// `tooling/check/process-starters.json`; it is left out until it is worth one.

import { type NetworkInterfaceInfo, networkInterfaces } from "node:os";
import type { NetworkTarget } from "./network-probes.ts";

/** The ports tried on each address: a router's or a neighbour's web interface. */
const lanPorts: readonly number[] = [80, 443];

/** A private IPv4 range. */
interface Ipv4Range {
  name: string;
  /** The first address of the range and its prefix length. */
  base: number;
  prefix: number;
}

const privateRanges: readonly Ipv4Range[] = [
  { name: "10.0.0.0/8", base: 0x0a000000, prefix: 8 },
  { name: "172.16.0.0/12", base: 0xac100000, prefix: 12 },
  { name: "192.168.0.0/16", base: 0xc0a80000, prefix: 16 },
];

/**
 * One address of the local network in each private range this computer is on,
 * and in each ULA network it is on, with the ports to try.
 *
 * @param interfaces the computer's network interfaces, as `os.networkInterfaces()` returns them
 */
export function lanTargets(
  interfaces: NodeJS.Dict<NetworkInterfaceInfo[]> = networkInterfaces(),
): NetworkTarget[] {
  const entries = Object.values(interfaces)
    .flatMap((list) => list ?? [])
    .filter((entry) => !entry.internal);
  const own = new Set(entries.map((entry) => entry.address.toLowerCase()));
  const addresses = [...ipv4Neighbours(entries, own), ...ipv6Neighbours(entries, own)];
  return addresses.flatMap((host) => lanPorts.map((port) => ({ host, port })));
}

/** One address in each private IPv4 range the computer is on, not its own. */
function ipv4Neighbours(
  entries: readonly NetworkInterfaceInfo[],
  own: ReadonlySet<string>,
): string[] {
  const found = new Map<string, string>();
  for (const entry of entries) {
    if (entry.family !== "IPv4") continue;
    const address = ipv4ToNumber(entry.address);
    const range = privateRanges.find((candidate) => inRange(address, candidate));
    if (range === undefined || found.has(range.name)) continue;
    const mask = ipv4ToNumber(entry.netmask);
    const network = (address & mask) >>> 0;
    const broadcast = (network | ~mask) >>> 0;
    const router = numberToIpv4(network + 1);
    const lastUsable = numberToIpv4(broadcast - 1);
    found.set(range.name, own.has(router) ? lastUsable : router);
  }
  return [...found.values()].filter((address) => !own.has(address));
}

/** One address in each unique local IPv6 network (fc00::/7) the computer is on, not its own. */
function ipv6Neighbours(
  entries: readonly NetworkInterfaceInfo[],
  own: ReadonlySet<string>,
): string[] {
  const found = new Set<string>();
  for (const entry of entries) {
    if (entry.family !== "IPv6") continue;
    const groups = expandIpv6(entry.address);
    if (groups === null || ((groups[0] ?? 0) & 0xfe00) !== 0xfc00) continue;
    const neighbour = [...groups.slice(0, 4), 0, 0, 0, 1]
      .map((group) => group.toString(16))
      .join(":");
    // `own` holds addresses as the system writes them, so compare the full forms.
    const isOwn = [...own].some(
      (address) =>
        expandIpv6(address)?.join(":") === neighbour.replace(/(^|:)0+(?=[0-9a-f])/g, "$1"),
    );
    if (!isOwn) found.add(neighbour);
  }
  return [...found];
}

function inRange(address: number, { base, prefix }: Ipv4Range): boolean {
  const mask = (0xffffffff << (32 - prefix)) >>> 0;
  return (address & mask) >>> 0 === base;
}

function ipv4ToNumber(address: string): number {
  return address.split(".").reduce((sum, part) => sum * 256 + Number(part), 0);
}

function numberToIpv4(value: number): string {
  return [24, 16, 8, 0].map((shift) => (value >>> shift) & 0xff).join(".");
}

/** The eight 16-bit groups of an IPv6 address, or `null` for a form this doesn't read (scoped or v4-mapped). */
function expandIpv6(address: string): number[] | null {
  if (address.includes("%") || address.includes(".")) return null;
  const [head = "", tail, ...rest] = address.split("::");
  if (rest.length > 0) return null;
  const side = (text: string) => (text === "" ? [] : text.split(":"));
  const start = side(head);
  const end = tail === undefined ? [] : side(tail);
  const missing = 8 - start.length - end.length;
  if (missing < 0 || (tail === undefined && missing !== 0)) return null;
  const groups = [...start, ...Array<string>(missing).fill("0"), ...end].map((group) =>
    Number.parseInt(group, 16),
  );
  return groups.length === 8 && groups.every((group) => Number.isInteger(group)) ? groups : null;
}
