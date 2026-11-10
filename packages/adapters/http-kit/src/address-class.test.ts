import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { type AddressClass, addressAllowedFor, classifyAddress } from "./address-class.ts";

verifies("http-kit.address-classes", () => {
  describe("attack case A7: answers a public name must never reach", () => {
    it.each<[string, AddressClass]>([
      ["127.0.0.1", "loopback"],
      ["10.0.0.5", "private"],
      ["192.168.1.1", "private"],
      ["169.254.169.254", "metadata"],
      ["::1", "loopback"],
      ["fd00:ec2::254", "metadata"],
      ["::ffff:127.0.0.1", "reserved"],
      ["::ffff:169.254.169.254", "reserved"],
      ["64:ff9b::a9fe:a9fe", "reserved"],
      ["fe80::1", "link-local"],
      ["febf:ffff::1", "link-local"],
      ["100.64.0.1", "reserved"],
      ["100.127.255.255", "reserved"],
      ["0.0.0.0", "unspecified"],
      ["::", "unspecified"],
    ])("puts %s in %s", (address, expected) => {
      expect(classifyAddress(address)).toBe(expected);
    });
  });

  it.each([
    "93.184.215.14",
    "8.8.8.8",
    "172.32.0.1",
    "100.128.0.1",
    "2606:2800:21f:cb07:6820:80da:af6b:8b2c",
    "64:ff9b::5db8:d70e",
    "2002:5db8:d70e::1",
  ])("counts %s as public", (address) => {
    expect(classifyAddress(address)).toBe("public");
  });

  it.each([
    "169.254.169.254",
    "169.254.170.2",
    "100.100.100.200",
    "fd00:ec2::254",
    "[fd00:ec2::254]",
  ])("counts %s as metadata, not the block around it", (address) => {
    expect(classifyAddress(address)).toBe("metadata");
  });

  it.each<[string, AddressClass]>([
    ["10.255.255.255", "private"],
    ["172.16.0.1", "private"],
    ["172.31.255.255", "private"],
    ["fc00::1", "private"],
    ["fd12:3456::1", "private"],
    ["127.255.0.1", "loopback"],
    ["169.254.0.1", "link-local"],
    ["0.1.2.3", "unspecified"],
  ])("puts the block edge %s in %s", (address, expected) => {
    expect(classifyAddress(address)).toBe(expected);
  });

  it.each([
    "192.0.0.8",
    "192.0.2.1",
    "198.51.100.7",
    "203.0.113.9",
    "198.18.0.1",
    "198.19.255.255",
    "192.88.99.1",
    "224.0.0.1",
    "239.255.255.250",
    "240.0.0.1",
    "255.255.255.255",
    "2001:db8::1",
    "3fff::1",
    "2001::1",
    "100::1",
    "ff02::1",
    "fec0::1",
    "::127.0.0.1",
    "::ffff:8.8.8.8",
    "64:ff9b::10.0.0.5",
    "2002:7f00:1::1",
    "2002:a9fe:a9fe::1",
    "4000::1",
  ])("counts %s as reserved", (address) => {
    expect(classifyAddress(address)).toBe("reserved");
  });

  it.each(["example.com", "", "localhost", "1.2.3", "::ffff:1.2.3.4.5"])(
    "throws for %j, which isn't an IP address",
    (text) => {
      expect(() => classifyAddress(text)).toThrow(RangeError);
    },
  );
});

verifies("http-kit.host-class-rule", () => {
  it("keeps only the public addresses of a mixed answer for a public host (A28)", () => {
    const answer = ["93.184.215.14", "10.0.0.5", "2606:2800:21f:cb07:6820:80da:af6b:8b2c", "::1"];
    expect(answer.filter((address) => addressAllowedFor("public", address))).toEqual([
      "93.184.215.14",
      "2606:2800:21f:cb07:6820:80da:af6b:8b2c",
    ]);
  });

  it.each(["93.184.215.14", "169.254.10.1", "fe80::1", "127.0.0.1", "169.254.169.254"])(
    "refuses %s for a home-network host (A9)",
    (address) => {
      expect(addressAllowedFor("private", address)).toBe(false);
    },
  );

  it.each(["192.168.1.20", "10.1.2.3", "fd00::20"])(
    "allows %s for a home-network host",
    (address) => {
      expect(addressAllowedFor("private", address)).toBe(true);
    },
  );

  it.each([
    ["127.0.0.1", true],
    ["::1", true],
    ["0.0.0.0", false],
    ["::ffff:127.0.0.1", false],
    ["192.168.1.20", false],
  ] as const)("for a host on this computer, %s is allowed: %s", (address, allowed) => {
    expect(addressAllowedFor("loopback", address)).toBe(allowed);
  });

  it("throws rather than allow an answer that isn't an address", () => {
    expect(() => addressAllowedFor("public", "not-an-address")).toThrow(RangeError);
  });
});
