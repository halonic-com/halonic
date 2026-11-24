import { MemoryDefinitionStore } from "@halonicjs/adapter-memory";
import type { ChatAnswer } from "@halonicjs/app";
import { verifies } from "@halonicjs/testing-spec";
import { loadWorkspace } from "@halonicjs/workspace";
import { describe, expect, it } from "vitest";
import { chatFailureOfAnswer } from "./chat-failure.ts";

const acme = {
  "workspace.yaml": "id: acme\nname: Acme\n",
  "models.yaml": [
    "aliases:",
    "  fast: { provider: ollama, model: llama3.1 }",
    "  smart: { provider: anthropic, model: claude-x }",
  ].join("\n"),
  "providers/ollama.yaml": "id: ollama\nname: Ollama\ntype: ollama\nlocal: true\n",
  "providers/anthropic.yaml": "id: anthropic\nname: Anthropic\ntype: anthropic\n",
  "hubs/support/hub.yaml": "id: support\nname: Support\n",
};

const unreachable = (host?: string): ChatAnswer => ({
  messages: [],
  end: {
    reason: "failed",
    error: new Error("Ollama didn't answer."),
    toolsRan: false,
    cause: { reason: "model-unreachable", ...(host === undefined ? {} : { host }) },
  },
});

const loaded = () => loadWorkspace(new MemoryDefinitionStore(acme, "memory:acme"));

verifies("studio.assistant-chat-failure", () => {
  describe("chatFailureOfAnswer", () => {
    it("names the alias's provider and its address, from the workspace's files", async () => {
      const settings = { hubId: "support", alias: "fast" };
      expect(chatFailureOfAnswer(unreachable(), settings, await loaded())).toEqual({
        reason: "model-unreachable",
        provider: "Ollama",
        address: "localhost:11434",
        alias: "fast",
        local: true,
      });
    });

    it("names the Settings › Assistant model by its provider type", async () => {
      const agent = { type: "anthropic", model: "claude-x", local: false };
      const answer = unreachable("api.anthropic.com");
      expect(chatFailureOfAnswer(answer, { hubId: "support", agent }, await loaded())).toEqual({
        reason: "model-unreachable",
        provider: "anthropic",
        address: "api.anthropic.com",
        alias: "anthropic/claude-x",
        local: false,
      });
    });

    it("gives no facts for an answer that didn't fail at the model, and the general failure for an agent chat", async () => {
      const workspace = await loaded();
      const answered: ChatAnswer = { messages: [], end: { reason: "answered" } };
      expect(chatFailureOfAnswer(answered, { hubId: "support" }, workspace)).toBeUndefined();
      const agentChat = { hubId: "support", agentId: "sorter" };
      expect(chatFailureOfAnswer(unreachable("h:1"), agentChat, workspace)).toMatchObject({
        reason: "error",
      });
    });
  });
});
