import { choiceProvider, type ModelChoice } from "@halonicjs/app";
import { SecretText } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { acmeFiles, acmeFolder } from "./first-run-model-choice.testing.ts";

const anthropic: ModelChoice = { kind: "key", provider: "anthropic" };
const llama: ModelChoice = { kind: "local", model: "llama3.2" };

async function passed(folder: ReturnType<typeof acmeFolder>, choice: ModelChoice) {
  const key = choice.kind === "key" ? new SecretText("sk-ant-api03-acme-test") : undefined;
  const tested = await folder.service.test(choice, key);
  if (tested.kind !== "tested" || tested.outcome !== "ok") throw new Error("the test didn't pass");
  return tested.testId;
}

verifies("studio.first-run-choice-trust", () => {
  it("shows the one secret and Local only, then trusts exactly the files written", async () => {
    const folder = acmeFolder();
    const testId = await passed(folder, anthropic);

    const preview = await folder.service.preview(testId);
    expect(preview).toMatchObject({
      reaches: { name: "Anthropic", secrets: 1, host: undefined, local: false },
      localOnlyOff: true,
    });
    expect(folder.disk.get("models.yaml")).toBe(acmeFiles["models.yaml"]);

    const saved = await folder.service.continue(testId, preview?.fingerprint);

    expect(saved).toMatchObject({ ok: true, trusted: true });
    expect(folder.granted).toEqual(new Set([preview?.fingerprint]));
    // The trust check of the files as written gives the fingerprint the preview showed.
    expect(folder.trust.check).toMatchObject({
      status: "trusted",
      fingerprint: preview?.fingerprint,
    });
  });

  it("shows Ollama's host and no secret for a local model, and leaves Local only on", async () => {
    const folder = acmeFolder();
    const testId = await passed(folder, llama);

    const preview = await folder.service.preview(testId);

    expect(preview).toMatchObject({
      reaches: { name: "Ollama", secrets: 0, host: "localhost:11434", local: true },
      localOnlyOff: false,
    });
    expect(await folder.service.continue(testId, preview?.fingerprint)).toMatchObject({
      ok: true,
      trusted: true,
    });
  });

  it("shows no fingerprint, and trusts nothing, in a folder nobody trusted", async () => {
    const folder = acmeFolder({
      files: {
        ...acmeFiles,
        "providers/openai.yaml": "id: openai\ntype: openai\nsecret: openai-api-key\n",
      },
    });
    const testId = await passed(folder, anthropic);

    const preview = await folder.service.preview(testId);
    expect(preview?.fingerprint).toBeUndefined();

    expect(await folder.service.continue(testId, preview?.fingerprint)).toMatchObject({
      ok: true,
      trusted: false,
    });
    expect(folder.steps).not.toContain("grant");
  });

  it("trusts nothing when Continue gets a fingerprint the preview didn't show", async () => {
    const files = {
      ...acmeFiles,
      "connectors/mail.yaml": "name: Mail\ntransport:\n  stdio:\n    command: acme-mail\n",
    };
    // The fingerprint of the files as Continue writes them, worked out apart from the service.
    const written = acmeFolder({
      files: { ...files, "providers/anthropic.yaml": choiceProvider(anthropic).fileText },
    });
    await written.trust.refresh();
    const check = written.trust.check;
    if (check === undefined || check.status === "refused") throw new Error("no trust check");
    const afterChange = check.fingerprint;

    const folder = acmeFolder({ files });
    const testId = await passed(folder, anthropic);
    expect((await folder.service.preview(testId))?.fingerprint).toBeUndefined();

    expect(await folder.service.continue(testId, afterChange)).toMatchObject({
      ok: true,
      trusted: false,
    });
    expect(folder.steps).not.toContain("grant");
  });

  it("trusts nothing when Continue comes without a preview for its test", async () => {
    const folder = acmeFolder();
    const shown = await folder.service.preview(await passed(folder, anthropic));
    const testId = await passed(folder, anthropic);

    expect(await folder.service.continue(testId, shown?.fingerprint)).toMatchObject({
      ok: true,
      trusted: false,
    });
    expect(folder.steps).not.toContain("grant");
  });

  it("trusts a folder a person trusted before, with the one provider added", async () => {
    const folder = acmeFolder({
      files: {
        ...acmeFiles,
        "providers/openai.yaml": "id: openai\ntype: openai\nsecret: openai-api-key\n",
      },
    });
    await folder.trustAsItIs();
    const testId = await passed(folder, anthropic);

    const preview = await folder.service.preview(testId);

    expect(await folder.service.continue(testId, preview?.fingerprint)).toMatchObject({
      trusted: true,
    });
  });

  it("trusts nothing when the folder changed after the line was shown", async () => {
    const folder = acmeFolder();
    const testId = await passed(folder, anthropic);
    const preview = await folder.service.preview(testId);
    folder.disk.set(
      "connectors/mail.yaml",
      "name: Mail\ntransport:\n  stdio:\n    command: acme-mail\n",
    );

    expect(await folder.service.continue(testId, preview?.fingerprint)).toMatchObject({
      ok: true,
      trusted: false,
    });
    expect(folder.granted.size).toBe(0);
  });
});

verifies("studio.first-run-choice-order", () => {
  it("saves the key, then the files as one step, then trusts", async () => {
    const folder = acmeFolder();
    const testId = await passed(folder, anthropic);
    const preview = await folder.service.preview(testId);

    await folder.service.continue(testId, preview?.fingerprint);

    expect(folder.steps).toEqual([
      "key: anthropic-api-key",
      "change: Updated model alias default: providers/anthropic.yaml, models.yaml, workspace.yaml",
      "settle",
      "grant",
    ]);
  });

  it("says the key was saved when the files fail to save, takes the edits back, and trusts nothing", async () => {
    const folder = acmeFolder();
    const testId = await passed(folder, anthropic);
    const preview = await folder.service.preview(testId);
    folder.state.failSave = new Error("The disk is full.");

    expect(await folder.service.continue(testId, preview?.fingerprint)).toEqual({
      ok: false,
      failed: "write",
      keySaved: true,
      reason: "The disk is full.",
    });
    expect(folder.steps.slice(-2)).toEqual(["settle", "undo: Updated model alias default"]);
    expect(folder.unsaved.size).toBe(0);
    expect(folder.steps).not.toContain("grant");
  });

  it("changes and saves nothing where nothing saves the files", async () => {
    const folder = acmeFolder({ saves: false });
    const testId = await passed(folder, anthropic);

    expect(await folder.service.continue(testId, undefined)).toMatchObject({
      ok: false,
      failed: "no-save",
      keySaved: false,
    });
    expect(folder.steps).toEqual([]);
    expect(folder.stored.size).toBe(0);
  });

  it("changes no file when the key store fails", async () => {
    const folder = acmeFolder();
    const testId = await passed(folder, anthropic);
    folder.state.failKey = new Error("Access denied.");

    expect(await folder.service.continue(testId, undefined)).toMatchObject({
      ok: false,
      failed: "key",
      keySaved: false,
    });
    expect(folder.steps).toEqual(["key: anthropic-api-key"]);
  });

  it("points the alias only at the local model whose test passed", async () => {
    const folder = acmeFolder();
    const testId = await passed(folder, llama);

    await folder.service.continue(testId, undefined);

    expect(folder.disk.get("models.yaml")).toContain("model: llama3.2");
    expect(folder.stored.size).toBe(0);
  });
});
