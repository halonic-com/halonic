import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { acmeFiles, acmeFolder } from "./first-run-model-choice.test-helper.ts";
import { choiceKey } from "./model-choice-service.ts";

async function passedTestOf(
  folder: ReturnType<typeof acmeFolder>,
  key: ReturnType<typeof choiceKey>,
) {
  const tested = await folder.service.test({ kind: "key", provider: "anthropic" }, key);
  if (tested.kind !== "tested" || tested.outcome !== "ok") throw new Error("the test didn't pass");
  return tested.testId;
}

verifies("app.model-choice-current", () => {
  it("calls the test model Sample answers", async () => {
    expect(await acmeFolder().service.current()).toEqual({ kind: "sample" });
  });

  it("names a provider by its file's name, with the model, after a choice is saved", async () => {
    const folder = acmeFolder();
    const testId = await passedTestOf(folder, choiceKey("sk-ant-acme-test-1"));
    await folder.service.continue(testId, undefined);

    expect(await folder.service.current()).toEqual({
      kind: "provider",
      name: "Anthropic",
      model: "claude-haiku-5-5",
      local: false,
    });
  });

  it("names a provider file without a name by its id, and says a local one is local", async () => {
    const folder = acmeFolder({
      files: {
        ...acmeFiles,
        "models.yaml": "aliases:\n  default:\n    provider: ollama\n    model: llama3.2\n",
        "providers/ollama.yaml":
          "id: ollama\ntype: openai-compatible\nbaseUrl: http://localhost:11434/v1\nlocal: true\n",
      },
    });
    expect(await folder.service.current()).toEqual({
      kind: "provider",
      name: "ollama",
      model: "llama3.2",
      local: true,
    });
  });

  it("knows nothing without a default alias, or when its provider's file is missing", async () => {
    const noDefault = acmeFolder({
      files: {
        ...acmeFiles,
        "models.yaml": "aliases:\n  fast:\n    provider: mock\n    model: echo\n",
      },
    });
    const noProvider = acmeFolder({
      files: { "models.yaml": acmeFiles["models.yaml"] ?? "" },
    });
    expect(await noDefault.service.current()).toBeUndefined();
    expect(await noProvider.service.current()).toBeUndefined();
  });
});
