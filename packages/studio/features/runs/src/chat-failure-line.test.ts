import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { chatFailureLine } from "./chat-failure-line.ts";

const unreachable = {
  reason: "model-unreachable",
  provider: "anthropic",
  address: "api.anthropic.com",
  alias: "smart",
  local: false,
} as const;

verifies("runs.run-view.failure-banners", () => {
  describe("chatFailureLine", () => {
    it("ends F7 with try again, naming a known provider by its name", () => {
      expect(chatFailureLine(unreachable)).toBe(
        "Halonic couldn't reach Anthropic at api.anthropic.com for the model alias smart. This computer may be offline. Check your internet connection, then try again.",
      );
      expect(chatFailureLine({ ...unreachable, provider: "Ollama", local: true })).toBe(
        "Halonic couldn't reach Ollama at api.anthropic.com for the model alias smart. Ollama may not be running on this computer. Start Ollama, then try again.",
      );
    });

    it("names the model for a model no alias points at, and an address without a host", () => {
      const direct = { ...unreachable, alias: "anthropic/claude-x" };
      expect(chatFailureLine(direct)).toContain("for the model claude-x.");
      expect(chatFailureLine({ ...direct, address: "" })).toBe(
        "Halonic couldn't reach Anthropic for the model claude-x: its address has no host. Check Anthropic's address in Models. It starts with http:// or https://, such as http://localhost:11434.",
      );
    });

    it("says F8 with its fix, and nothing for another failure", () => {
      const memory = {
        reason: "model-out-of-memory",
        provider: "ollama",
        model: "big",
        alias: "x",
      } as const;
      expect(chatFailureLine(memory)).toBe(
        "Ollama couldn't load big: this computer doesn't have enough free memory for it. Close other programs, or pick a smaller model in Models.",
      );
      expect(chatFailureLine({ reason: "internal" })).toBeUndefined();
    });
  });
});
