import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { setup } from "./workspace-agents.test-helper.ts";

verifies("studio.workspace-agents-output", () => {
  describe("WorkspaceAgents output", () => {
    it("reads and saves the output in place, and refuses a list of options with none", async () => {
      const { host, store, changes } = setup();
      const ref = { hubId: "acme", id: "writer" };
      const path = "hubs/acme/agents/writer.agent.yaml";
      expect((await host.settings(ref)).output).toEqual({ type: "text" });

      await host.update(ref, { output: { type: "choice", options: ["reply", "archive"] } });
      expect(store[path]).toContain("description: Drafts replies.");
      expect((await host.settings(ref)).output).toEqual({
        type: "choice",
        options: ["reply", "archive"],
      });

      const schema = { type: "object", properties: { label: { type: "string" } } };
      await host.update(ref, { output: { type: "json", schema } });
      expect((await host.settings(ref)).output).toEqual({ type: "json", schema });
      await host.update(ref, { output: { type: "json", schema: undefined } });
      expect((await host.settings(ref)).output).toEqual({ type: "json" });
      expect(store[path]).not.toContain("schema:");
      await host.update(ref, { output: { type: "text" } });
      expect((await host.settings(ref)).output).toEqual({ type: "text" });

      const written = changes.length;
      await expect(
        host.update(ref, { output: { type: "choice", options: [] } }),
      ).rejects.toMatchObject({ kind: "invalid_input" });
      expect(changes).toHaveLength(written);
    });
  });
});
