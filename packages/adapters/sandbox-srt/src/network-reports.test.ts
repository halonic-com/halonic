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

    it.each([
      ["a refused file read", "deny file-read-data acme/.env"],
      ["a line without a reason", "deny network-outbound example.com:443"],
      ["a port no request can have", "deny network-outbound example.com:70000 (malformed host)"],
      ["an empty line", ""],
    ])("reports nothing for %s", (_name, line) => {
      expect(parseNetworkReport(line)).toBeNull();
    });
  });
});
