import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { setup } from "./workspace-agents.test-helper.ts";

// Invented providers, as a workspace's `providers/` folder would hold them.
const anthropic = "id: anthropic\nname: Anthropic\ntype: anthropic\n";
const ollama = "id: ollama\nname: Ollama\ntype: ollama\nlocal: true\n";
const mock = "id: mock\nname: Test model\ntype: mock\n";
const gateway =
  "id: gateway\nname: Acme gateway\ntype: openai-compatible\nbaseUrl: https://gateway.example.com/v1\n";
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
  "  coder:",
  "    provider: gateway",
  "    model: coder-large",
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
  store["providers/gateway.yaml"] = gateway;
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
        harnessFit: { codex: "refused" },
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
        harnessFit: { "claude-code": "refused", codex: "refused", opencode: "refused" },
      });
      expect((await host.aliasSummary(writer, "test"))?.cost).toEqual({ kind: "test-model" });
    });

    it("answers nothing for an alias the hub doesn't have", async () => {
      const { host } = withProviders();
      expect(await host.aliasSummary(writer, "smrt")).toBeUndefined();
    });
  });
});

verifies("agents.configuration.harness-model", () => {
  it("tells the Model page which harnesses can't call the alias's provider, by run's own check", async () => {
    const { host } = withProviders();
    expect((await host.aliasSummary(writer, "smart"))?.harnessFit).toEqual({ codex: "refused" });
    expect((await host.aliasSummary(writer, "coder"))?.harnessFit).toEqual({
      "claude-code": "refused",
      codex: "check-endpoint",
      opencode: "refused",
    });
  });
});
