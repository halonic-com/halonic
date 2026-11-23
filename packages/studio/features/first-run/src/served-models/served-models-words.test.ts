import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { notCommittedText } from "../pick-model/pick-model-words.ts";
import { currentModelName } from "./served-models-words.ts";

verifies("first-run.pick-model-not-committed", () => {
  it("says has for one file, and lists more with and before the last", () => {
    const tail = "changes that aren't committed. Commit or undo them, then try again.";
    expect(notCommittedText(["models.yaml"])).toBe(`Couldn't save: models.yaml has ${tail}`);
    expect(notCommittedText(["models.yaml", "workspace.yaml"])).toBe(
      `Couldn't save: models.yaml and workspace.yaml have ${tail}`,
    );
    expect(notCommittedText(["models.yaml", "providers/anthropic.yaml", "workspace.yaml"])).toBe(
      `Couldn't save: models.yaml, providers/anthropic.yaml and workspace.yaml have ${tail}`,
    );
  });
});

verifies("first-run.served-models", () => {
  it("names the model as Pick a model names its options", () => {
    expect(currentModelName({ kind: "sample" })).toBe("Sample answers");
    expect(
      currentModelName({
        kind: "provider",
        name: "Anthropic",
        model: "claude-haiku-5-5",
        local: false,
      }),
    ).toBe("Anthropic");
    expect(
      currentModelName({ kind: "provider", name: "Ollama", model: "llama3.2", local: true }),
    ).toBe("llama3.2");
    expect(currentModelName(undefined)).toBeUndefined();
  });
});
