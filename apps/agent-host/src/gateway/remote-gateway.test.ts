import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { gatewayPolicy, riskyOff } from "./remote-gateway.ts";

verifies("agent-host.remote-gateway", () => {
  describe("gatewayPolicy", () => {
    it("lets no phone answer a risky approval while nothing sets the switch", () => {
      expect(gatewayPolicy(riskyOff).allowRiskyRemotely()).toBe(false);
    });

    it("asks the switch again for every answer, so a change takes effect at once", () => {
      let allowed = false;
      const policy = gatewayPolicy({ allowRiskyRemotely: () => allowed });
      expect(policy.allowRiskyRemotely()).toBe(false);
      allowed = true;
      expect(policy.allowRiskyRemotely()).toBe(true);
      allowed = false;
      expect(policy.allowRiskyRemotely()).toBe(false);
    });
  });
});
