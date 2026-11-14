import type { Models, Provider } from "@halonicjs/format";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { aliasRows, providerChoiceLabel } from "./alias-rows.ts";

const target = { params: {}, fallback: [] };
const context = { currency: "EUR", localProviders: new Set<string>() };

verifies("models.aliases.list", () => {
  it("lists aliases by name with provider / model", () => {
    const models = {
      version: 1,
      aliases: {
        smart: { ...target, provider: "anthropic", model: "claude-sonnet-5-5" },
        default: { ...target, provider: "ollama", model: "llama3.2" },
      },
    } as unknown as Models;
    expect(aliasRows(models, context).map((row) => row.label)).toEqual([
      "default · ollama / llama3.2",
      "smart · anthropic / claude-sonnet-5-5",
    ]);
  });

  it("labels a price per million tokens, or none", () => {
    const models = {
      version: 1,
      aliases: {
        smart: { ...target, provider: "a", model: "m", price: { input: 3, output: 15 } },
        fast: { ...target, provider: "b", model: "n" },
      },
    } as unknown as Models;
    expect(aliasRows(models, context).map((row) => row.price)).toEqual([
      undefined,
      "€3.00 in · €15.00 out per million tokens",
    ]);
  });

  it("writes the price in the workspace's currency", () => {
    const models = {
      version: 1,
      aliases: { smart: { ...target, provider: "a", model: "m", price: { input: 3, output: 15 } } },
    } as unknown as Models;
    const [row] = aliasRows(models, { ...context, currency: "USD" });
    expect(row?.price).toBe("$3.00 in · $15.00 out per million tokens");
  });

  it("marks an unpriced alias of a local provider, not an unpriced cloud one", () => {
    const models = {
      version: 1,
      aliases: {
        cloud: { ...target, provider: "anthropic", model: "m" },
        local: { ...target, provider: "ollama", model: "llama3.2" },
        paid: { ...target, provider: "ollama", model: "n", price: { input: 1, output: 2 } },
      },
    } as unknown as Models;
    const rows = aliasRows(models, { ...context, localProviders: new Set(["ollama"]) });
    expect(rows.map((row) => [row.name, row.runsLocally])).toEqual([
      ["cloud", false],
      ["local", true],
      ["paid", false],
    ]);
  });

  it("gives no rows for no aliases", () => {
    expect(aliasRows({ version: 1, aliases: {} } as unknown as Models, context)).toEqual([]);
  });
});

verifies("models.aliases.edit-target", () => {
  it("marks local providers in the provider list", () => {
    const ollama = { id: "ollama", name: "Ollama", local: true } as Provider;
    const openai = { id: "openai", name: "OpenAI", local: false } as Provider;
    expect(providerChoiceLabel(ollama)).toBe("Ollama (local)");
    expect(providerChoiceLabel(openai)).toBe("OpenAI");
  });
});
