import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { setup } from "./workspace-agents.test-helper.ts";

verifies("studio.workspace-agents-make-live", () => {
  describe("WorkspaceAgents make live", () => {
    it("opens Create version with only the agent's own file, and answers what it answered", async () => {
      const opened: (readonly string[])[] = [];
      const { host } = setup({
        versionDialog: async (paths) => {
          opened.push(paths);
          return opened.length === 1 ? "made" : "cancelled";
        },
      });
      expect(await host.makeLive?.({ hubId: "acme", id: "writer" })).toBe("made");
      expect(await host.makeLive?.({ hubId: "acme", id: "writer" })).toBe("cancelled");
      expect(opened).toEqual([
        ["hubs/acme/agents/writer.agent.yaml"],
        ["hubs/acme/agents/writer.agent.yaml"],
      ]);
    });

    it("rejects with not_found for an agent that isn't there, and opens nothing", async () => {
      const opened: (readonly string[])[] = [];
      const { host } = setup({
        versionDialog: async (paths) => {
          opened.push(paths);
          return "made";
        },
      });
      await expect(host.makeLive?.({ hubId: "acme", id: "nobody" })).rejects.toMatchObject({
        kind: "not_found",
      });
      expect(opened).toEqual([]);
    });

    it("has no Make live where the app can't open Create version", () => {
      expect(setup().host.makeLive).toBeUndefined();
    });
  });
});
