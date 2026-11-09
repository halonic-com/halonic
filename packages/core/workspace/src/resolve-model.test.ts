import { verifies } from "@halonicjs/testing-spec";
import { beforeAll, expect, it } from "vitest";
import { type LoadedWorkspace, loadWorkspace, resolveModel } from "./index.ts";
import { MemorySource } from "./test/memory-source.ts";

const files = {
  "workspace.yaml": "id: acme\nname: Acme\n",
  "providers/anthropic.yaml": "id: anthropic\nname: Anthropic\ntype: anthropic\n",
  "providers/openai.yaml": "id: openai\nname: OpenAI\ntype: openai\n",
  "models.yaml": [
    "aliases:",
    "  smart:",
    "    provider: anthropic",
    "    model: claude-opus-5-5",
    "    params: { temperature: 0.2 }",
    "    price: { input: 5, output: 25 }",
    "    fallback: [fast, gone]",
    "  fast:",
    "    provider: anthropic",
    "    model: claude-haiku-4-5",
    "    fallback: [smart]",
    "",
  ].join("\n"),
  "hubs/billing/hub.yaml": [
    "id: billing",
    "name: Billing",
    "models:",
    "  smart:",
    "    provider: openai",
    "    model: gpt-5",
    "",
  ].join("\n"),
};

let workspace: LoadedWorkspace;

beforeAll(async () => {
  workspace = await loadWorkspace(new MemorySource(files));
  // The fallback "gone" is broken on purpose; it is the only error.
  const errors = workspace.issues.filter((issue) => issue.severity === "error");
  expect(errors.map((issue) => issue.message)).toEqual([
    'Alias "smart" falls back to unknown alias "gone"',
  ]);
});

verifies("workspace.model-aliases", () => {
  it("resolves an alias of models.yaml to its provider, model, params and price", () => {
    expect(resolveModel(workspace, null, "smart")).toEqual({
      provider: "anthropic",
      model: "claude-opus-5-5",
      params: { temperature: 0.2 },
      price: { input: 5, output: 25 },
      alias: "smart",
      fallback: [{ provider: "anthropic", model: "claude-haiku-4-5", params: {}, alias: "fast" }],
    });
  });

  it("prefers the hub's own alias in its hub, and keeps models.yaml's at the root", () => {
    expect(resolveModel(workspace, "billing", "smart")).toMatchObject({
      provider: "openai",
      model: "gpt-5",
      fallback: [],
    });
    expect(resolveModel(workspace, null, "smart")?.provider).toBe("anthropic");
  });

  it("resolves fallbacks one level deep and leaves out one no alias has", () => {
    // fast falls back to smart, but smart's fallback list holds fast alone.
    const fallback = resolveModel(workspace, null, "smart")?.fallback ?? [];
    expect(fallback.map((target) => target.alias)).toEqual(["fast"]);
    expect(fallback[0]).not.toHaveProperty("fallback");
  });

  it("splits provider/model at the first slash, with no alias", () => {
    expect(resolveModel(workspace, "billing", "ollama/llama3:8b/q4")).toEqual({
      provider: "ollama",
      model: "llama3:8b/q4",
      params: {},
      fallback: [],
    });
  });

  it("gives undefined for an alias the hub doesn't have", () => {
    expect(resolveModel(workspace, "billing", "local")).toBeUndefined();
  });
});
