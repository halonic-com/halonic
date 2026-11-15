import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { defaultBaseUrl } from "./index.ts";

verifies("ports.provider-default-base-url", () => {
  describe("defaultBaseUrl", () => {
    it("gives the usual address of the types that have one", () => {
      expect(defaultBaseUrl("openai")).toBe("https://api.openai.com/v1");
      expect(defaultBaseUrl("ollama")).toBe("http://localhost:11434/v1");
      expect(defaultBaseUrl("lmstudio")).toBe("http://localhost:1234/v1");
    });

    it("gives undefined for any other type", () => {
      for (const type of ["openai-compatible", "mock", "", "constructor", "__proto__"]) {
        expect(defaultBaseUrl(type), type).toBeUndefined();
      }
    });
  });
});
