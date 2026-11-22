import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { ownCardWords } from "./own-card-words.ts";

/** The waiting line as it reads, from its parts. */
function checkingLine(name: string, address: string | undefined): string {
  const { before, address: shown, after } = ownCardWords.checking(name, address);
  return `${before}${shown ?? ""}${after}`;
}

// Flow check C638 #6 (HAL-15830): the words file held only "Checking Ollama".
verifies("first-run.own-card", () => {
  describe("ownCardWords.checking", () => {
    it("names the provider and its address, as the requirement's waiting line does", () => {
      expect(checkingLine("Ollama", "localhost:11434")).toBe("Checking Ollama at localhost:11434…");
      expect(ownCardWords.checking("Ollama", "localhost:11434").address).toBe("localhost:11434");
    });

    it("leaves out the address when the provider has none", () => {
      expect(checkingLine("LM Studio", undefined)).toBe("Checking LM Studio…");
    });
  });
});
