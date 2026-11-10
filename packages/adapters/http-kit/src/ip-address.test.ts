import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { classifyAddress } from "./address-class.ts";
import { parseIpAddress } from "./ip-address.ts";

verifies("http-kit.canonical-literals", () => {
  describe("attack case A11: loose spellings of an address", () => {
    it.each(["2130706433", "0177.0.0.1", "0x7f000001", "127.1", "0x7f.0.0.1", "127.000.0.1"])(
      "refuses %s, which only URL may read",
      (text) => {
        expect(parseIpAddress(text)).toBeUndefined();
        expect(() => classifyAddress(text)).toThrow(RangeError);
      },
    );

    it.each([
      ["https://2130706433/", "loopback"],
      ["https://0177.0.0.1/", "loopback"],
      ["https://0x7f000001/", "loopback"],
      ["https://127.1/", "loopback"],
      ["https://10.0.0.1/", "private"],
      ["http://169.254.169.254/", "metadata"],
      ["https://[::1]/", "loopback"],
      ["https://[::ffff:7f00:1]/", "reserved"],
    ])("classifies the host URL reads from %s as %s", (url, expected) => {
      expect(classifyAddress(new URL(url).hostname)).toBe(expected);
    });
  });

  it.each([
    "fe80::1%eth0",
    "[fe80::1%25eth0]",
    "1::2::3",
    ":::",
    "1:2:3:4:5:6:7:8:9",
    "1:2:3:4:5:6:7",
    "1:2:3:4::5:6:7:8",
  ])("refuses the IPv6 text %s", (text) => {
    expect(parseIpAddress(text)).toBeUndefined();
  });

  it.each(["256.0.0.1", "1.2.3.-4", "1.2.3.4 ", "[1.2.3.4]", "12345::", "g::1", "::1.2.3"])(
    "refuses %j",
    (text) => {
      expect(parseIpAddress(text)).toBeUndefined();
    },
  );

  it("reads dotted IPv4 into four bytes", () => {
    expect(parseIpAddress("192.168.0.1")).toEqual({ version: 4, bytes: [192, 168, 0, 1] });
  });

  it.each([
    ["::", [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]],
    ["::1", [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1]],
    ["[::1]", [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1]],
    ["fe80::", [0xfe, 0x80, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]],
    ["1:2:3:4:5:6:7::", [0, 1, 0, 2, 0, 3, 0, 4, 0, 5, 0, 6, 0, 7, 0, 0]],
    ["::ffff:1.2.3.4", [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0xff, 0xff, 1, 2, 3, 4]],
    ["0:0:0:0:0:FFFF:1.2.3.4", [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0xff, 0xff, 1, 2, 3, 4]],
    ["2001:db8:0:0:0:0:0:abcd", [0x20, 0x01, 0x0d, 0xb8, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0xab, 0xcd]],
  ])("reads the IPv6 text %s into sixteen bytes", (text, bytes) => {
    expect(parseIpAddress(text)).toEqual({ version: 6, bytes });
  });
});
