import { parseFile } from "@halonicjs/format";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { type ChoiceFiles, choiceEdits } from "./model-choice-edits.ts";

// Acme's files as the demo copies them (examples/acme).
const acmeModels = `aliases:
  default:
    description: The test model. Scripted replies, no network and no key.
    provider: mock
    model: echo
`;

const acmeWorkspace = `# Acme is an invented company.
id: acme
name: Acme
# Local only, as every new workspace starts.
privacy:
  localOnly: true
defaults:
  model: default
`;

const acme: ChoiceFiles = { models: acmeModels, workspace: acmeWorkspace, provider: undefined };

function editsOf(...args: Parameters<typeof choiceEdits>) {
  const edits = choiceEdits(...args);
  if (!edits.ok) throw new Error(`no edits: ${JSON.stringify(edits.error)}`);
  return edits.value;
}

function textOf(edits: ReturnType<typeof editsOf>, path: string): string {
  const file = edits.files.find((candidate) => candidate.path === path);
  if (file === undefined) throw new Error(`${path} isn't changed`);
  return file.text;
}

function defaultAlias(text: string) {
  const parsed = parseFile("models", text);
  if (!parsed.ok) throw new Error("models.yaml doesn't parse");
  return parsed.value.value.aliases["default"];
}

verifies("app.model-choice-alias", () => {
  it("points default at the provider's model, without the test model's description", () => {
    const edits = editsOf({ kind: "key", provider: "openai" }, acme);
    const alias = defaultAlias(textOf(edits, "models.yaml"));
    expect(alias).toMatchObject({ provider: "openai", model: "gpt-6-luna" });
    expect(alias?.description).toBeUndefined();
    expect(edits.changes).toContainEqual({
      kind: "alias-repointed",
      file: "models.yaml",
      alias: "default",
      provider: "openai",
      providerName: "OpenAI",
      model: "gpt-6-luna",
      local: false,
    });
  });

  it("drops the old model's price and params, and keeps comments and fallbacks", () => {
    const models = `# Our models.
aliases:
  default:
    provider: mock
    model: echo
    params: { temperature: 0.2 }
    price: { input: 1, output: 2 }
    fallback: [spare]
  spare:
    provider: mock
    model: echo
`;
    const text = textOf(
      editsOf({ kind: "local", model: "llama3.2" }, { ...acme, models }),
      "models.yaml",
    );
    expect(text).toContain("# Our models.");
    const alias = defaultAlias(text);
    expect(alias).toMatchObject({ provider: "ollama", model: "llama3.2", fallback: ["spare"] });
    expect(alias?.price).toBeUndefined();
    expect(alias?.params).toEqual({});
  });

  it("changes nothing when default already points there", () => {
    const models = "aliases:\n  default:\n    provider: anthropic\n    model: claude-haiku-5-5\n";
    const provider = "id: anthropic\ntype: anthropic\nsecret: anthropic-api-key\n";
    const workspace = "id: acme\nname: Acme\nprivacy:\n  localOnly: false\n";
    const edits = editsOf({ kind: "key", provider: "anthropic" }, { models, workspace, provider });
    expect(edits.files).toEqual([]);
    expect(edits.changes).toEqual([]);
  });

  it("says models.yaml stops it when the file doesn't read", () => {
    expect(
      choiceEdits({ kind: "local", model: "llama3.2" }, { ...acme, models: "aliases: [" }),
    ).toEqual({
      ok: false,
      error: { kind: "unreadable", file: "models.yaml" },
    });
  });
});

verifies("app.model-choice-provider-file", () => {
  it("adds the missing provider file first, and saves the key under its secret name", () => {
    const edits = editsOf({ kind: "key", provider: "gemini" }, acme);
    expect(edits.files.map((file) => file.path)).toEqual([
      "providers/gemini.yaml",
      "models.yaml",
      "workspace.yaml",
    ]);
    expect(textOf(edits, "providers/gemini.yaml")).toContain(
      "baseUrl: https://generativelanguage.googleapis.com/v1beta/openai",
    );
    expect(edits.changes[0]).toEqual({
      kind: "provider-added",
      file: "providers/gemini.yaml",
      provider: "gemini",
    });
    expect(edits.secretName).toBe("gemini-api-key");
  });

  it("keeps the workspace's own provider file and its secret name", () => {
    const provider = "id: anthropic\nname: Anthropic\ntype: anthropic\nsecret: team-key\n";
    const edits = editsOf({ kind: "key", provider: "anthropic" }, { ...acme, provider });
    expect(edits.files.map((file) => file.path)).toEqual(["models.yaml", "workspace.yaml"]);
    expect(edits.secretName).toBe("team-key");
  });

  it("keeps a local Ollama file on another port, with no secret name", () => {
    const provider = "id: ollama\ntype: ollama\nbaseUrl: http://localhost:11500/v1\nlocal: true\n";
    const edits = editsOf({ kind: "local", model: "llama3.2" }, { ...acme, provider });
    expect(edits.files.map((file) => file.path)).toEqual(["models.yaml"]);
    expect(edits.secretName).toBeUndefined();
  });

  it.each([
    [
      "another type",
      { kind: "key", provider: "openai" },
      "id: openai\ntype: openai-compatible\nbaseUrl: https://proxy.acme.test/v1\nsecret: k\n",
    ],
    ["no secret name", { kind: "key", provider: "openai" }, "id: openai\ntype: openai\n"],
    [
      "another address",
      { kind: "key", provider: "gemini" },
      "id: gemini\ntype: openai-compatible\nbaseUrl: https://proxy.acme.test/v1\nsecret: k\n",
    ],
    [
      "an address where the provider's own is meant",
      { kind: "key", provider: "anthropic" },
      "id: anthropic\ntype: anthropic\nbaseUrl: https://proxy.acme.test\nsecret: k\n",
    ],
    ["Ollama not local", { kind: "local", model: "llama3.2" }, "id: ollama\ntype: ollama\n"],
    ["a file that doesn't read", { kind: "key", provider: "openai" }, "id: [openai\n"],
  ] as const)("stops at a provider file with %s", (_, choice, provider) => {
    const file = `providers/${choice.kind === "key" ? choice.provider : "ollama"}.yaml`;
    expect(choiceEdits(choice, { ...acme, provider })).toEqual({
      ok: false,
      error: { kind: "provider-differs", file },
    });
  });
});

verifies("app.model-choice-local-only", () => {
  it("turns Local only off on the key path, keeping the comments", () => {
    const edits = editsOf({ kind: "key", provider: "anthropic" }, acme);
    const text = textOf(edits, "workspace.yaml");
    expect(text).toContain("# Local only, as every new workspace starts.");
    expect(text).toContain("localOnly: false");
    expect(edits.changes.at(-1)).toEqual({ kind: "local-only-off", file: "workspace.yaml" });
  });

  it("leaves Local only on for a local model", () => {
    const edits = editsOf({ kind: "local", model: "llama3.2" }, acme);
    expect(edits.files.map((file) => file.path)).toEqual(["providers/ollama.yaml", "models.yaml"]);
    expect(edits.changes.some((change) => change.kind === "local-only-off")).toBe(false);
  });

  it("changes nothing in a workspace that isn't Local only", () => {
    const workspace = "id: acme\nname: Acme\n";
    const edits = editsOf({ kind: "key", provider: "anthropic" }, { ...acme, workspace });
    expect(edits.files.map((file) => file.path)).not.toContain("workspace.yaml");
  });

  it("says workspace.yaml stops it when the file doesn't read", () => {
    expect(
      choiceEdits({ kind: "key", provider: "anthropic" }, { ...acme, workspace: "privacy: [" }),
    ).toEqual({ ok: false, error: { kind: "unreadable", file: "workspace.yaml" } });
  });
});
