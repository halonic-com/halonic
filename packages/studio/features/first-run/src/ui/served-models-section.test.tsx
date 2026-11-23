// @vitest-environment jsdom
import type { CurrentModel, ModelChoiceLine } from "@halonicjs/app";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import type { ModelChoiceSaved, ModelChoiceService } from "../api.ts";
import { ServedModelsView } from "./served-models-section.tsx";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mounted: { root: Root; container: HTMLElement }[] = [];

afterEach(() => {
  for (const { root, container } of mounted.splice(0)) {
    act(() => root.unmount());
    container.remove();
  }
});

const anthropicLine: ModelChoiceLine = {
  reaches: { name: "Anthropic", secrets: 1, host: undefined, local: false },
  localOnlyOff: true,
};

/** The computer's model choice as a served window sees it: `default` is Sample answers until saved. */
function servedService(saved: ModelChoiceSaved) {
  let current: CurrentModel = { kind: "sample" };
  const service: ModelChoiceService = {
    keySaved: async () => false,
    localModels: async () => ({ kind: "none-downloaded" }),
    lineFacts: async () => anthropicLine,
    test: vi.fn(async () => ({ kind: "tested" as const, outcome: "ok" as const, testId: "t1" })),
    preview: async () => ({ ...anthropicLine, fingerprint: undefined }),
    continue: vi.fn(async () => {
      if (saved.ok) {
        current = { kind: "provider", name: "Anthropic", model: "claude-haiku-5-5", local: false };
      }
      return saved;
    }),
    current: async () => current,
  };
  return service;
}

async function open(service: ModelChoiceService) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  mounted.push({ root, container });
  await act(async () => root.render(<ServedModelsView service={service} />));
  return container;
}

function buttonNamed(root: HTMLElement, name: string): HTMLButtonElement | undefined {
  // The kit's Button also holds its busy label, to keep its width, so the label starts its text.
  return [...root.querySelectorAll("button")].find((button) =>
    button.textContent?.startsWith(name),
  );
}

/** Opens Pick a model from the Model row, pastes a key and presses Test and continue. */
async function pickAnthropic(root: HTMLElement) {
  await act(async () => buttonNamed(root, "Pick a model")?.click());
  const field = root.querySelector<HTMLInputElement>('input[type="password"]');
  if (field) field.value = "sk-ant-pasted";
  await act(async () => buttonNamed(root, "Test and continue")?.click());
}

verifies("first-run.served-models", () => {
  it("names the current model in the Model row, and opens and leaves Pick a model", async () => {
    const root = await open(servedService({ ok: true, changes: [], trusted: true }));
    expect(root.textContent).toContain("Model");
    expect(root.textContent).toContain("Sample answers");

    await act(async () => buttonNamed(root, "Pick a model")?.click());
    expect(root.querySelector("h1")?.textContent).toBe("Pick a model");
    expect(root.textContent).not.toContain("Keys need the desktop app.");

    await act(async () => buttonNamed(root, "Back")?.click());
    expect(root.querySelector("h1")).toBeNull();
    expect(buttonNamed(root, "Pick a model")).toBeDefined();
  });

  it("comes back naming the saved model, with the trust line while the computer doesn't trust it", async () => {
    const service = servedService({ ok: true, changes: [], trusted: false });
    const root = await open(service);
    await pickAnthropic(root);

    expect(service.continue).toHaveBeenCalledWith("t1", undefined);
    expect(root.querySelector("h1")).toBeNull();
    expect(root.textContent).toContain("Anthropic");
    expect(root.querySelector('[role="status"]')?.textContent).toBe(
      "Saved. Trust this workspace on your computer before your next run.",
    );
  });

  it("shows no trust line when the computer trusts the workspace after the save", async () => {
    const root = await open(servedService({ ok: true, changes: [], trusted: true }));
    await pickAnthropic(root);
    expect(root.querySelector('[role="status"]')).toBeNull();
  });
});

verifies("first-run.pick-model-not-committed", () => {
  it("names the files with uncommitted changes and stays on the screen", async () => {
    const root = await open(
      servedService({
        ok: false,
        failed: "not-committed",
        keySaved: true,
        files: ["models.yaml", "workspace.yaml"],
        reason: "The computer keeps the reason in its own log.",
      }),
    );
    await pickAnthropic(root);

    expect(root.querySelector("h1")?.textContent).toBe("Pick a model");
    expect(root.textContent).toContain(
      "Couldn't save: models.yaml and workspace.yaml have changes that aren't committed. Commit or undo them, then try again.",
    );
  });
});
