import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { bridgeServerName, isBridgeTool, permissionServerName } from "./bridge-tools.ts";

verifies("harness-claude-code.stream-json", () => {
  describe("isBridgeTool", () => {
    it.each([
      `mcp__${bridgeServerName}__send_email`,
      `mcp__${permissionServerName}__approve_permission`,
    ])("knows %s as a bridge tool", (name) => {
      expect(isBridgeTool(name)).toBe(true);
    });

    it.each([
      "Bash",
      "mcp__other__send_email",
      "mcp__halonic_extra__x",
      "mcp__halonic-approvals_x__y",
      "halonic",
    ])("knows %s isn't one", (name) => {
      expect(isBridgeTool(name)).toBe(false);
    });
  });
});
