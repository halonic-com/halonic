import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { setup, writerFile } from "./workspace-agents.test-helper.ts";

// Invented: a provider and the name its key would be stored under, never a key.
const anthropic = "id: anthropic\nname: Anthropic\ntype: anthropic\nsecret: anthropic-api-key\n";
const writer = { hubId: "acme", id: "writer" };

verifies("studio.workspace-agents-model-key", () => {
  describe("WorkspaceAgents model key", () => {
    it("names the agent's model and its provider while the key isn't stored, and nothing once it is", async () => {
      const stored = new Set<string>();
      const asked: string[] = [];
      const { host, store } = setup({
        hasKey: async (secretName) => {
          asked.push(secretName);
          return stored.has(secretName);
        },
      });
      store["providers/anthropic.yaml"] = anthropic;
      expect(await host.missingModelKey?.(writer)).toEqual({
        model: "fast",
        provider: "Anthropic",
        secretName: "anthropic-api-key",
      });
      stored.add("anthropic-api-key");
      expect(await host.missingModelKey?.(writer)).toBeUndefined();
      expect(asked).toEqual(["anthropic-api-key", "anthropic-api-key"]);
    });

    it("answers nothing for a program with its own sign-in, or a provider the workspace doesn't have", async () => {
      const { host, store } = setup({ hasKey: async () => false });
      expect(await host.missingModelKey?.(writer)).toBeUndefined();
      store["providers/anthropic.yaml"] = anthropic;
      store["hubs/acme/agents/writer.agent.yaml"] = `${writerFile}harness: claude-code\n`;
      expect(await host.missingModelKey?.(writer)).toBeUndefined();
    });

    it("has no answer where keys can't be asked", () => {
      expect(setup().host.missingModelKey).toBeUndefined();
    });
  });
});
