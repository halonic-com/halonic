import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { onSubnet, subnetOf } from "./lan-interface.ts";

verifies("agent-host.remote-pair-advert", () => {
  describe("subnetOf and onSubnet", () => {
    it("counts an address on the interface's subnet, and nothing else", () => {
      const subnet = subnetOf({ address: "192.168.1.20", netmask: "255.255.255.0" });
      expect(onSubnet(subnet, "192.168.1.1")).toBe(true);
      expect(onSubnet(subnet, "192.168.1.255")).toBe(true);
      for (const other of ["192.168.2.1", "10.0.0.1", "::1", "192.168.1", "192.168.1.256", ""]) {
        expect(onSubnet(subnet, other)).toBe(false);
      }
    });

    it("reads masks from /1 to /32", () => {
      expect(onSubnet(subnetOf({ address: "10.1.2.3", netmask: "128.0.0.0" }), "127.9.9.9")).toBe(
        true,
      );
      const one = subnetOf({ address: "10.1.2.3", netmask: "255.255.255.255" });
      expect(onSubnet(one, "10.1.2.3")).toBe(true);
      expect(onSubnet(one, "10.1.2.4")).toBe(false);
    });

    it("refuses an address that isn't IPv4, and a mask that isn't a run of ones or is empty", () => {
      for (const lan of [
        { address: "fe80::1", netmask: "255.255.255.0" },
        { address: "192.168.01.20", netmask: "255.255.255.0" },
        { address: "192.168.1.20", netmask: "255.0.255.0" },
        { address: "192.168.1.20", netmask: "0.0.0.0" },
        { address: "192.168.1.20", netmask: "ffff:ffff::" },
      ]) {
        expect(() => subnetOf(lan)).toThrow(RangeError);
      }
    });
  });
});
