import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { button, type FakeStudio, fakeStudio } from "../fake-studio.test-helper.ts";
import { clickTestSteps } from "../steps.ts";
import { configurationText } from "../words.ts";
import { harnessModel } from "./harness-model.ts";
import { writerBox } from "./try-it.ts";

const { configuration, harness, model, halonic, codex, codexRefused, testModel } =
  configurationText;

/**
 * Writer's page after the Try it steps: Configuration's Harness page saves Codex or Halonic, and
 * the Model page's test model shows Codex's sentence while Writer is in Codex, if `refuses`.
 */
function studioOnWriter(refuses = true): FakeStudio {
  const studio = fakeStudio("Acme Writer");
  const main = studio.windows.get("main");
  let inCodex = false;
  button(studio, "main", writerBox);
  button(studio, "main", configuration.text);
  button(studio, "main", harness.text);
  button(studio, "main", model.text);
  button(studio, "main", codex.text, () => {
    inCodex = true;
  });
  button(studio, "main", halonic.text, () => {
    inCodex = false;
  });
  button(studio, "main", testModel.text, () => {
    if (main !== undefined && inCodex && refuses) main.text = `Acme Writer ${codexRefused.text}`;
  });
  return studio;
}

verifies("studio-click-test.harness-model-step", () => {
  it("comes straight after the Try it steps", () => {
    const ids = clickTestSteps.map((step) => step.id);
    expect(ids.slice(ids.indexOf("try-it-key"), ids.indexOf("try-it-key") + 2)).toEqual([
      "try-it-key",
      "harness-model",
    ]);
  });

  it("sees Codex's sentence for the test model, then puts Writer back on Halonic", async () => {
    const studio = studioOnWriter();

    await expect(harnessModel.run(studio.context)).resolves.toEqual({ passed: true });
    expect(studio.clicks).toEqual([
      writerBox,
      configuration.text,
      harness.text,
      codex.text,
      model.text,
      testModel.text,
      harness.text,
      halonic.text,
    ]);
  });

  it("fails as NO_REFUSAL without the sentence, and still puts Writer back on Halonic", async () => {
    const studio = studioOnWriter(false);

    await expect(harnessModel.run(studio.context)).resolves.toMatchObject({ code: "NO_REFUSAL" });
    expect(studio.clicks.at(-1)).toBe(halonic.text);
  });

  it("fails as NOT_BACK_ON_HALONIC when Halonic's option can't be picked", async () => {
    const studio = studioOnWriter();
    studio.windows.get("main")?.buttons.delete(halonic.text);

    await expect(harnessModel.run(studio.context)).resolves.toMatchObject({
      code: "NOT_BACK_ON_HALONIC",
    });
  });

  it("fails as NO_WRITER when Writer's page can't be opened", async () => {
    await expect(harnessModel.run(fakeStudio("Acme").context)).resolves.toMatchObject({
      code: "NO_WRITER",
    });
  });

  it("needs step 1", () => {
    expect(harnessModel.needs).toEqual(["engine-answers"]);
  });
});
