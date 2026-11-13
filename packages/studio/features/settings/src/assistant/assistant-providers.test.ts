import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import {
  assistantProviders,
  type ProviderFields,
  pickProvider,
  providerDefaults,
} from "./assistant-providers.ts";

const anthropic: ProviderFields = { baseUrl: "", secretName: "anthropic-api-key", local: false };

verifies("settings.ai-agent-provider-defaults", () => {
  it("lists the providers in the flow's order", () => {
    expect(assistantProviders.map((provider) => providerDefaults[provider].label)).toEqual([
      "Not set up",
      "Anthropic",
      "OpenAI",
      "Gemini",
      "Ollama (local)",
      "LM Studio (local)",
      "OpenAI-compatible",
    ]);
  });

  it("fills in the new provider's secret name over the old provider's default", () => {
    expect(pickProvider(anthropic, "anthropic", "openai")).toEqual({
      baseUrl: "",
      secretName: "openai-api-key",
      local: false,
    });
  });

  it("keeps a field the person changed", () => {
    const changed = { ...anthropic, secretName: "work-key" };
    expect(pickProvider(changed, "anthropic", "openai").secretName).toBe("work-key");
  });

  it("fills in a local provider's address, Local and no secret name", () => {
    expect(pickProvider(anthropic, "anthropic", "ollama")).toEqual({
      baseUrl: "http://localhost:11434/v1",
      secretName: "",
      local: true,
    });
    expect(pickProvider(anthropic, "anthropic", "lmstudio").baseUrl).toBe(
      "http://localhost:1234/v1",
    );
  });

  it("clears the defaults of the provider it leaves, going back to Not set up", () => {
    const ollama = pickProvider(anthropic, "anthropic", "ollama");
    expect(pickProvider(ollama, "ollama", "not-set-up")).toEqual({
      baseUrl: "",
      secretName: "",
      local: false,
    });
  });

  it("gives the cloud providers an empty Base URL", () => {
    for (const provider of ["anthropic", "openai", "gemini"] as const) {
      expect(providerDefaults[provider].baseUrl).toBe("");
    }
  });
});
