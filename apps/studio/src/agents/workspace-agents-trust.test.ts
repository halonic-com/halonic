import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { setup } from "./workspace-agents.test-helper.ts";

verifies("studio.workspace-agents-trust", () => {
  describe("WorkspaceAgents trust", () => {
    it("says an untrusted folder may not start, and opens the window's trust check", async () => {
      let trusted = false;
      const asked: string[] = [];
      const { host } = setup({
        trust: {
          mayStart: () => trusted,
          askTrust: async () => {
            asked.push("ask");
            trusted = true;
            return "trusted";
          },
          workspaceName: "Acme",
        },
      });
      expect(host.mayStart?.()).toBe(false);
      expect(await host.askTrust?.()).toBe("trusted");
      expect(asked).toEqual(["ask"]);
      expect(host.mayStart?.()).toBe(true);
      expect(host.workspaceName?.()).toBe("Acme");
    });

    it("has none of the three where there is no folder to trust", () => {
      const { host } = setup();
      expect(host.mayStart).toBeUndefined();
      expect(host.askTrust).toBeUndefined();
      expect(host.workspaceName).toBeUndefined();
    });
  });
});
