import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { setup, writerFile } from "./workspace-agents.test-helper.ts";

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

verifies("studio.workspace-agents-params", () => {
  describe("WorkspaceAgents model settings", () => {
    it("sets and clears model settings in place, keeping the others and the provider extras", async () => {
      const { host, store, changes } = setup();
      const ref = { hubId: "acme", id: "writer" };
      const path = "hubs/acme/agents/writer.agent.yaml";
      store[path] = `${writerFile}params:\n  temperature: 0.2\n  extra:\n    seed: 7\n`;
      expect((await host.settings(ref)).params).toEqual({ temperature: 0.2 });

      await host.update(ref, {
        params: { topP: 0.9, maxTokens: 800, stop: ["END"], reasoningEffort: "high" },
      });
      expect((await host.settings(ref)).params).toEqual({
        temperature: 0.2,
        topP: 0.9,
        maxTokens: 800,
        stop: ["END"],
        reasoningEffort: "high",
      });

      await host.update(ref, { params: { temperature: null, stop: null } });
      expect((await host.settings(ref)).params).toEqual({
        topP: 0.9,
        maxTokens: 800,
        reasoningEffort: "high",
      });
      expect(store[path]).toContain("seed: 7");
      expect(store[path]).toContain("description: Drafts replies.");

      const written = changes.length;
      await host.update(ref, { params: { temperature: null } });
      expect(changes).toHaveLength(written);
    });

    it("refuses a model setting out of its range and writes nothing", async () => {
      const { host, changes } = setup();
      const ref = { hubId: "acme", id: "writer" };
      for (const params of [
        { temperature: 2.5 },
        { topP: -0.1 },
        { maxTokens: 0 },
        { maxTokens: 1.5 },
        { stop: [""] },
      ]) {
        await expect(host.update(ref, { params })).rejects.toMatchObject({
          kind: "invalid_input",
        });
      }
      expect(changes).toHaveLength(0);
    });
  });
});
