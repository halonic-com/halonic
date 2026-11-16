import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { gatewaySettings } from "./gateway-settings.ts";

verifies("agent-host.remote-gateway", () => {
  describe("gatewaySettings", () => {
    it("is off without --remote-gateway", () => {
      expect(gatewaySettings([])).toEqual({ enabled: false });
      expect(gatewaySettings(["--profile-folder", "p", "--stdio"])).toEqual({ enabled: false });
    });

    it("is on with --remote-gateway, on a free port", () => {
      expect(gatewaySettings(["--remote-gateway"])).toEqual({ enabled: true });
    });

    it("is on at the port --remote-gateway-port names", () => {
      expect(gatewaySettings(["--remote-gateway", "--remote-gateway-port", "4711"])).toEqual({
        enabled: true,
        port: 4711,
      });
    });

    it("refuses a port without the gateway, and a port that isn't one", () => {
      expect(gatewaySettings(["--remote-gateway-port", "4711"])).toHaveProperty("error");
      for (const value of ["0", "70000", "12.5", "abc", ""]) {
        expect(
          gatewaySettings(["--remote-gateway", "--remote-gateway-port", value]),
        ).toHaveProperty("error");
      }
      expect(gatewaySettings(["--remote-gateway", "--remote-gateway-port"])).toHaveProperty(
        "error",
      );
    });
  });
});
