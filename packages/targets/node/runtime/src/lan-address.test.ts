import type { NetworkInterfaceInfo } from "node:os";
import { describe, expect, it } from "vitest";
import { findLanAddress } from "./lan-address.ts";

function ipv4(address: string, internal: boolean): NetworkInterfaceInfo {
  return {
    address,
    netmask: "255.255.255.0",
    family: "IPv4",
    mac: "00:00:00:00:00:00",
    internal,
    cidr: `${address}/24`,
  };
}

describe("findLanAddress", () => {
  it("skips internal and IPv6 addresses and takes the first IPv4 by interface name", () => {
    const ipv6: NetworkInterfaceInfo = {
      address: "fe80::1",
      netmask: "ffff:ffff:ffff:ffff::",
      family: "IPv6",
      mac: "00:00:00:00:00:00",
      internal: false,
      cidr: "fe80::1/64",
      scopeid: 1,
    };
    expect(
      findLanAddress({
        lo: [ipv4("127.0.0.1", true)],
        wlan0: [ipv4("192.168.1.30", false)],
        eth0: [ipv6, ipv4("192.168.1.20", false)],
      }),
    ).toBe("192.168.1.20");
  });

  it("answers undefined when there is none", () => {
    expect(findLanAddress({ lo: [ipv4("127.0.0.1", true)], down: undefined })).toBeUndefined();
  });
});
