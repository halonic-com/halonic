import { SecretText } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { acmeFolder } from "./first-run-model-choice.testing.ts";

const anthropic = { kind: "key", provider: "anthropic" } as const;
const saved = "sk-ant-acme-saved-1";

/** An Acme folder with a key saved for Anthropic, and one for another name. */
function withSavedKey() {
  const folder = acmeFolder();
  folder.stored.set("anthropic-api-key", saved);
  folder.stored.set("acme-other-key", "not-for-anthropic");
  return folder;
}

verifies("studio.first-run-saved-key", () => {
  it("says which providers have a saved key", async () => {
    const folder = withSavedKey();

    expect(await folder.service.keySaved("anthropic")).toBe(true);
    expect(await folder.service.keySaved("openai")).toBe(false);
  });

  it("tests with the saved key when none is pasted, and Continue leaves it as it is", async () => {
    const folder = withSavedKey();

    const tested = await folder.service.test(anthropic);
    expect(tested).toMatchObject({ kind: "tested", outcome: "ok" });
    expect(folder.calls.map((call) => call.key)).toEqual([saved]);
    if (tested.kind !== "tested" || tested.outcome !== "ok") throw new Error("no id");

    expect(await folder.service.continue(tested.testId, undefined)).toMatchObject({ ok: true });
    expect(folder.steps.some((step) => step.startsWith("key:"))).toBe(false);
    expect(folder.disk.get("models.yaml")).toContain("provider: anthropic");
  });

  it("calls nothing when no key is pasted and none is saved", async () => {
    const folder = acmeFolder();

    expect(await folder.service.test(anthropic)).toEqual({
      kind: "not-a-key",
      problem: { kind: "empty", keyStart: "sk-ant-" },
    });
    expect(folder.calls).toEqual([]);
  });

  it("tests a pasted key over a saved one", async () => {
    const folder = withSavedKey();

    await folder.service.test(anthropic, new SecretText("sk-ant-acme-new-2"));

    expect(folder.calls.map((call) => call.key)).toEqual(["sk-ant-acme-new-2"]);
  });
});

verifies("studio.first-run-choice-trust", () => {
  it("gives the trust line's facts before the test, without a fingerprint or a write", async () => {
    const folder = acmeFolder();

    expect(await folder.service.lineFacts(anthropic)).toEqual({
      reaches: { name: "Anthropic", secrets: 1, host: undefined, local: false },
      localOnlyOff: true,
    });
    expect(folder.steps).toEqual([]);
    expect(folder.calls).toEqual([]);
  });
});
