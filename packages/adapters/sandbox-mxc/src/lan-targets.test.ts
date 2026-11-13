import type { NetworkInterfaceInfo } from "node:os";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { lanTargets } from "./lan-targets.ts";

/** One interface address, as `os.networkInterfaces()` lists it. */
function entry(
  family: "IPv4" | "IPv6",
  address: string,
  netmask: string,
  internal = false,
): NetworkInterfaceInfo {
  return { family, address, netmask, internal } as NetworkInterfaceInfo;
}

const hostsOf = (targets: { host: string }[]) => [...new Set(targets.map(({ host }) => host))];

verifies("sandbox-mxc.canary", () => {
  describe("the local network addresses the box must not reach", () => {
    it("takes the router's usual address in each private range the computer is on", () => {
      const targets = lanTargets({
        wifi: [entry("IPv4", "192.168.1.20", "255.255.255.0")],
        office: [entry("IPv4", "10.4.7.9", "255.255.0.0")],
        lab: [entry("IPv4", "172.20.3.3", "255.255.240.0")],
      });
      expect(hostsOf(targets)).toEqual(["192.168.1.1", "10.4.0.1", "172.20.0.1"]);
    });

    it("takes the last usable address when the computer is the router's address itself", () => {
      const targets = lanTargets({ nat: [entry("IPv4", "192.168.137.1", "255.255.255.0")] });
      expect(hostsOf(targets)).toEqual(["192.168.137.254"]);
    });

    it("leaves out loopback, public and link-local addresses", () => {
      const targets = lanTargets({
        lo: [entry("IPv4", "127.0.0.1", "255.0.0.0", true), entry("IPv6", "::1", "ffff::", true)],
        wan: [entry("IPv4", "203.0.113.5", "255.255.255.0")],
        auto: [entry("IPv4", "169.254.3.4", "255.255.0.0"), entry("IPv6", "fe80::1", "ffff::")],
      });
      expect(targets).toEqual([]);
    });

    it("takes one neighbour in each unique local IPv6 network, not a global or scoped address", () => {
      const targets = lanTargets({
        home: [
          entry("IPv6", "fd12:3456:789a:1::25", "ffff:ffff:ffff:ffff::"),
          entry("IPv6", "2001:db8::5", "ffff:ffff:ffff:ffff::"),
        ],
      });
      expect(hostsOf(targets)).toEqual(["fd12:3456:789a:1:0:0:0:1"]);
    });

    it("tries the web ports on each address", () => {
      const targets = lanTargets({ wifi: [entry("IPv4", "192.168.1.20", "255.255.255.0")] });
      expect(targets).toEqual([
        { host: "192.168.1.1", port: 80 },
        { host: "192.168.1.1", port: 443 },
      ]);
    });
  });
});
