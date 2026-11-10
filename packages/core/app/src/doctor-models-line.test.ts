import { err, ok } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { doctorSummary } from "./doctor-checks.ts";
import { type ModelProviderState, modelsLine } from "./doctor-models-line.ts";

const llama = { name: "llama3.2", memoryBytes: 2_000_000_000 };

const ollama: ModelProviderState = {
  provider: "ollama",
  name: "Ollama",
  runs: "on-this-computer",
  address: "localhost:11434",
  models: ok([llama]),
};

const ollamaDown: ModelProviderState = { ...ollama, models: err(new Error("ECONNREFUSED")) };

function anthropic(keyStored: boolean): ModelProviderState {
  return { provider: "anthropic", name: "Anthropic", runs: "with-a-key", keyStored };
}

verifies("app.doctor-models", () => {
  it("lists a provider on this computer that answers and a provider whose key is stored", () => {
    const line = modelsLine(
      [ollama, anthropic(true)],
      [
        { alias: "fast", provider: "ollama" },
        { alias: "smart", provider: "anthropic" },
      ],
    );

    expect(line).toEqual({
      check: "models",
      status: "ok",
      ready: [
        {
          provider: "ollama",
          name: "Ollama",
          answering: true,
          address: "localhost:11434",
          models: [llama],
        },
        { provider: "anthropic", name: "Anthropic", keyStored: true },
      ],
      problems: [],
    });
  });

  it("warns once for each alias whose provider's key isn't stored, and doctor still exits 0", () => {
    const line = modelsLine(
      [anthropic(false)],
      [
        { alias: "smart", provider: "anthropic" },
        { alias: "writer", provider: "anthropic" },
      ],
    );

    expect(line?.status).toBe("warning");
    expect(line?.ready).toEqual([]);
    expect(line?.problems).toEqual([
      { problem: "no-key", alias: "smart", provider: "anthropic", name: "Anthropic" },
      { problem: "no-key", alias: "writer", provider: "anthropic", name: "Anthropic" },
    ]);
    expect(line && doctorSummary([line]).needsFixing).toBe(false);
  });

  it("fails when a provider on this computer doesn't answer, so doctor exits 1", () => {
    const line = modelsLine([ollamaDown], [{ alias: "fast", provider: "ollama" }]);

    expect(line).toEqual({
      check: "models",
      status: "failed",
      ready: [],
      problems: [
        { problem: "unreachable", provider: "ollama", name: "Ollama", address: "localhost:11434" },
      ],
    });
    expect(line && doctorSummary([line]).needsFixing).toBe(true);
  });

  it("fails with both problems when one provider doesn't answer and another has no key", () => {
    const line = modelsLine(
      [ollamaDown, anthropic(false)],
      [
        { alias: "smart", provider: "anthropic" },
        { alias: "fast", provider: "ollama" },
      ],
    );

    expect(line?.status).toBe("failed");
    expect(line?.problems.map((problem) => problem.problem)).toEqual(["unreachable", "no-key"]);
  });

  it("has no line when the workspace has no model aliases", () => {
    expect(modelsLine([], [])).toBeUndefined();
  });

  it("throws when an alias names a provider the host didn't give", () => {
    expect(() => modelsLine([], [{ alias: "smart", provider: "anthropic" }])).toThrow(
      "The model alias smart uses the provider anthropic, which wasn't given.",
    );
  });
});
