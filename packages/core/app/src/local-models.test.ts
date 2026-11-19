import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import {
  type DownloadedModelSource,
  detectLocalModels,
  ollamaDownloadedModels,
} from "./local-models.ts";

function answering(models: readonly string[]): DownloadedModelSource {
  return { downloadedModels: async () => models };
}

verifies("app.local-models-one", () => {
  it("gives the one model Ollama has downloaded", async () => {
    expect(await detectLocalModels(answering(["llama3.2"]))).toEqual({
      kind: "one",
      model: "llama3.2",
    });
  });
});

verifies("app.local-models-several", () => {
  it("gives every model, in Ollama's order", async () => {
    expect(await detectLocalModels(answering(["qwen3:8b", "llama3.2"]))).toEqual({
      kind: "several",
      models: ["qwen3:8b", "llama3.2"],
    });
  });
});

verifies("app.local-models-none-downloaded", () => {
  it("tells an Ollama with no models from one that isn't there", async () => {
    expect(await detectLocalModels(answering([]))).toEqual({ kind: "none-downloaded" });
  });
});

verifies("app.local-models-not-found", () => {
  it("gives not-found with the source's error, and doesn't throw", async () => {
    const refused = new Error("connect ECONNREFUSED 127.0.0.1:11434");
    const source: DownloadedModelSource = {
      downloadedModels: () => Promise.reject(refused),
    };

    expect(await detectLocalModels(source)).toEqual({ kind: "not-found", cause: refused });
  });

  it("gives not-found when Ollama's list has a model without a name", async () => {
    const source: DownloadedModelSource = {
      downloadedModels: async () => ollamaDownloadedModels({ models: [{ size: 1 }] }),
    };

    expect(await detectLocalModels(source)).toMatchObject({ kind: "not-found" });
  });
});

verifies("app.local-models-ollama-list", () => {
  it("takes each name in order and drops the :latest tag", () => {
    const body = {
      models: [
        { name: "llama3.2:latest", size: 2_019_393_189 },
        { name: "qwen3:8b", size: 5_225_388_164 },
      ],
    };

    expect(ollamaDownloadedModels(body)).toEqual(["llama3.2", "qwen3:8b"]);
  });

  it("keeps a tag that only ends in latest", () => {
    expect(ollamaDownloadedModels({ models: [{ name: "acme:not-latest" }] })).toEqual([
      "acme:not-latest",
    ]);
  });

  it.each([
    ["an error answer", { error: "unknown" }],
    ["a list that isn't one", { models: "llama3.2" }],
    ["no object at all", "llama3.2"],
  ])("throws for %s", (_what, body) => {
    expect(() => ollamaDownloadedModels(body)).toThrow(/no "models" list/);
  });

  it.each([
    ["no name", { size: 1 }],
    ["an empty name", { name: "" }],
    ["a name that isn't text", { name: 3 }],
    ["an entry that isn't an object", "llama3.2"],
  ])("throws for a model with %s", (_what, entry) => {
    expect(() => ollamaDownloadedModels({ models: [entry] })).toThrow(/no "name"/);
  });
});
