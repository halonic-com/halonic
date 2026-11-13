// The network half of the fence proof and the canary: what the probe program
// tries to reach from inside the box, and how its answers are read.
//
// A probe that fails is not a probe that was blocked. With
// `inheritDefaultEnvironment: false` and no `SystemRoot`, Winsock can fail to
// start in the box, and every connection then fails for a reason that has
// nothing to do with the fence. So a result counts as blocked only when
//   - the system refused it (`refused`: ECONNREFUSED, EACCES, EPERM, no route), or
//   - nothing came back (`timeout`) while the network control, a connection to
//     the bridge, which the box is allowed, did connect: the network works in
//     there, so the silence is the fence.
// Anything else is unproven, and an unproven result proves nothing.

import type { SandboxBridge } from "@halonicjs/ports";
import { lanTargets } from "./lan-targets.ts";
import type { LeakReport, NetworkAttempt } from "./probe-scripts.ts";

/** An address and a port the probe tries. */
export interface NetworkTarget {
  host: string;
  port: number;
}

/**
 * Addresses outside this computer that the probe tries over TCP: two public
 * resolvers' HTTPS ports, one over IPv4 and one over IPv6. Addresses, never
 * names: a name goes through the DNS client service outside the box.
 */
export const internetTargets: readonly NetworkTarget[] = [
  { host: "1.1.1.1", port: 443 },
  { host: "2606:4700:4700::1111", port: 443 },
];

/** Public DNS servers the probe asks directly, over UDP, bypassing the system's resolver. */
export const dnsTargets: readonly NetworkTarget[] = [
  { host: "1.1.1.1", port: 53 },
  { host: "8.8.8.8", port: 53 },
];

/** The network settings the probe program reads, apart from the listeners it must not reach. */
export function networkSettings(bridge: SandboxBridge | null): {
  internet: readonly NetworkTarget[];
  dns: readonly NetworkTarget[];
  lan: readonly NetworkTarget[];
  bridge: NetworkTarget | null;
} {
  const control =
    bridge !== null && bridge.kind === "loopback" ? { host: bridge.host, port: bridge.port } : null;
  return { internet: internetTargets, dns: dnsTargets, lan: lanTargets(), bridge: control };
}

/** What the probe's network attempts found. */
export interface NetworkJudgement {
  /** A listener on this computer (loopback or another address of it) was reached. */
  portReached: boolean;
  /** The router's usual address, or another address of the local network, was reached. */
  lanReached: boolean;
  /** An address outside this computer was reached. */
  internetReached: boolean;
  /** A public DNS server answered a query sent straight to it. */
  dnsReached: boolean;
  /** One sentence for each attempt that neither connected nor was proven blocked. */
  unproven: string[];
}

/** How many attempts of each kind the probe was asked to make. */
export interface NetworkAsked {
  ports: number;
  lan: number;
  internet: number;
  dns: number;
}

/** Reads the network part of a leak report. A missing attempt is unproven, never blocked. */
export function judgeNetwork(report: LeakReport, asked: NetworkAsked): NetworkJudgement {
  const controlConnected = report.network?.state === "connected";
  const unproven: string[] = [];
  const read = (kind: string, attempts: readonly NetworkAttempt[], expected: number): boolean => {
    if (attempts.length !== expected) {
      unproven.push(`the probe reported ${attempts.length} ${kind} attempts, not ${expected}`);
    }
    for (const attempt of attempts) {
      if (attempt.state === "connected") continue;
      const silenceIsFence = attempt.state === "timeout" && controlConnected;
      if (attempt.state !== "refused" && !silenceIsFence) unproven.push(describe(kind, attempt));
    }
    return attempts.some((attempt) => attempt.state === "connected");
  };
  return {
    portReached: read("local port", report.ports, asked.ports),
    lanReached: read("local network", report.lan, asked.lan),
    internetReached: read("internet", report.internet, asked.internet),
    dnsReached: read("DNS", report.dns, asked.dns),
    unproven,
  };
}

/** The sentence for an attempt that proves nothing. */
function describe(kind: string, { host, port, state, code }: NetworkAttempt): string {
  const how =
    state === "timeout"
      ? "timed out, and the box could not reach its bridge to show that its network works"
      : `failed with ${code ?? "an unknown error"}, which is not a refusal`;
  return `the ${kind} attempt to ${host}:${port} ${how}`;
}
