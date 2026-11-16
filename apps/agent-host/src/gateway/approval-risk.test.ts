import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { judgeApprovalRisk } from "./approval-risk.ts";

verifies("agent-host.gateway-run-ledger", () => {
  describe("judgeApprovalRisk", () => {
    it("calls a shell command and a file write risky", () => {
      expect(judgeApprovalRisk("shell")).toBe("risky");
      expect(judgeApprovalRisk("Bash")).toBe("risky");
      expect(judgeApprovalRisk("apply_patch")).toBe("risky");
      expect(judgeApprovalRisk("Write")).toBe("risky");
    });

    it("calls a read risky too, as it may reach a secret outside the fence", () => {
      expect(judgeApprovalRisk("Read")).toBe("risky");
      expect(judgeApprovalRisk("Grep")).toBe("risky");
      expect(judgeApprovalRisk("LS")).toBe("risky");
    });

    it("calls a tool it doesn't know risky", () => {
      expect(judgeApprovalRisk("some_connector_tool")).toBe("risky");
    });
  });
});
