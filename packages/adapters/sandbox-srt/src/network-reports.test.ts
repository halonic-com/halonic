import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { parseNetworkReport } from "./network-reports.ts";

verifies("sandbox-srt.network-reports", () => {
  describe("parseNetworkReport", () => {
    it("reads the host and port of a refused request", () => {
      expect(
        parseNetworkReport(
          "deny network-outbound registry.npmjs.org:443 (host is not on the allow list)",
        ),
      ).toEqual({ kind: "network", host: "registry.npmjs.org", port: 443 });
    });

    it.each([
      ["deny network-outbound ::1:8080 (host is not on the allow list)", "::1"],
      ["deny network-outbound [::1]:8080 (host is not on the allow list)", "[::1]"],
    ])("takes the port after the last colon of an IPv6 address: %s", (line, host) => {
      expect(parseNetworkReport(line)).toEqual({ kind: "network", host, port: 8080 });
    });

    it("reads a host of 255 characters, the longest srt lets through", () => {
      const host = `${"a".repeat(251)}.dev`;
      expect(parseNetworkReport(`deny network-outbound ${host}:443 (not allowed)`)).toEqual({
        kind: "network",
        host,
        port: 443,
      });
    });

    it.each([
      ["a refused file read", "deny file-read-data acme/.env"],
      ["a line without a reason", "deny network-outbound example.com:443"],
      ["a port no request can have", "deny network-outbound example.com:70000 (malformed host)"],
      ["port 0", "deny network-outbound example.com:0 (not allowed)"],
      ["an empty line", ""],
      // On Windows the program can write to the report pipe, so these are what a forged line could hold.
      ["a host srt would refuse", "deny network-outbound <b>acme</b>:443 (not allowed)"],
      ["a host with a slash", "deny network-outbound acme.example/path:443 (not allowed)"],
      ["a host with a zone id", "deny network-outbound [fe80::1%eth0]:443 (not allowed)"],
      [
        "a host of 300 characters",
        `deny network-outbound ${"a".repeat(296)}.dev:443 (not allowed)`,
      ],
      ["a host that is only brackets", "deny network-outbound []:443 (not allowed)"],
    ])("reports nothing for %s", (_name, line) => {
      expect(parseNetworkReport(line)).toBeNull();
    });
  });
});
