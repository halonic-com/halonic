import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { setup } from "./workspace-agents.test-helper.ts";

// Invented providers, as a workspace's `providers/` folder would hold them.
const anthropic = "id: anthropic\nname: Anthropic\ntype: anthropic\n";
const ollama = "id: ollama\nname: Ollama\ntype: ollama\nlocal: true\n";
const mock = "id: mock\nname: Test model\ntype: mock\n";
const models = [
  "aliases:",
  "  smart:",
  "    provider: anthropic",
  "    model: claude-sonnet",
  "    price: { input: 3, output: 15 }",
  "  fast:",
  "    provider: anthropic",
  "    model: claude-haiku",
  "  local:",
  "    provider: ollama",
  "    model: llama3.2",
  "  test:",
  "    provider: mock",
  "    model: echo",
  "",
].join("\n");
const writer = { hubId: "acme", id: "writer" };

function withProviders() {
  const { host, store } = setup();
  store["models.yaml"] = models;
  store["providers/anthropic.yaml"] = anthropic;
  store["providers/ollama.yaml"] = ollama;
  store["providers/mock.yaml"] = mock;
  return { host, store };
}

verifies("studio.workspace-agents-alias-line", () => {
  describe("WorkspaceAgents alias line", () => {
    it("names the alias's provider and model, with its price in euros", async () => {
      const { host } = withProviders();
      expect(await host.aliasSummary(writer, "smart")).toEqual({
        provider: "Anthropic",
        model: "claude-sonnet",
        cost: { kind: "price", input: "€3.00", output: "€15.00" },
      });
    });

    it("writes the price in the budget's currency", async () => {
      const { host, store } = withProviders();
      store["workspace.yaml"] = "id: acme\nname: Acme\nbudget:\n  currency: USD\n";
      expect((await host.aliasSummary(writer, "smart"))?.cost).toEqual({
        kind: "price",
        input: "$3.00",
        output: "$15.00",
      });
    });

    it("says why there is no price to pay: none yet, on this computer, or the test model", async () => {
      const { host } = withProviders();
      expect((await host.aliasSummary(writer, "fast"))?.cost).toEqual({ kind: "no-price" });
      expect(await host.aliasSummary(writer, "local")).toEqual({
        provider: "Ollama",
        model: "llama3.2",
        cost: { kind: "on-this-computer" },
      });
      expect((await host.aliasSummary(writer, "test"))?.cost).toEqual({ kind: "test-model" });
    });

    it("answers nothing for an alias the hub doesn't have", async () => {
      const { host } = withProviders();
      expect(await host.aliasSummary(writer, "smrt")).toBeUndefined();
    });
  });
});
