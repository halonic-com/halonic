import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { providerNameOf } from "./provider-name.ts";

verifies("runs.run-view.failure-banners", () => {
  describe("providerNameOf", () => {
    it("takes the file's name before the known one", () => {
      expect(providerNameOf("openai", () => "Work OpenAI")).toBe("Work OpenAI");
    });

    it("knows the providers Halonic ships by their ids", () => {
      expect(
        ["anthropic", "openai", "gemini", "ollama", "lmstudio"].map((id) =>
          providerNameOf(id, undefined),
        ),
      ).toEqual(["Anthropic", "OpenAI", "Gemini", "Ollama", "LM Studio"]);
    });

    it("keeps any other id as written, even one an object has", () => {
      expect(providerNameOf("my-server", () => undefined)).toBe("my-server");
      expect(providerNameOf("constructor", undefined)).toBe("constructor");
    });
  });
});
