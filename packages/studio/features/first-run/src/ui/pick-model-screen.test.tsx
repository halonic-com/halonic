// @vitest-environment jsdom
import type { FirstRunKeyProvider, LocalModels } from "@halonicjs/app";
import type { SecretText } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import type { ModelChoiceService, ModelChoiceTest } from "../api.ts";
import { PickModel } from "../pick-model/pick-model.ts";
import { PickModelScreen } from "./pick-model-screen.tsx";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mounted: { root: Root; container: HTMLElement; pick: PickModel }[] = [];

afterEach(() => {
  for (const { root, container, pick } of mounted.splice(0)) {
    act(() => root.unmount());
    container.remove();
    pick.dispose();
  }
});

/** A model choice service with the saved keys and the local models a test sets. */
function fakeService(saved: FirstRunKeyProvider[], local: LocalModels, test?: ModelChoiceTest) {
  const service: ModelChoiceService = {
    keySaved: async (provider) => saved.includes(provider),
    localModels: async () => local,
    lineFacts: async () => ({
      reaches: { name: "Anthropic", secrets: 1, host: undefined, local: false },
      localOnlyOff: true,
    }),
    test: vi.fn(async () => test ?? { kind: "superseded" as const }),
    preview: async () => undefined,
    continue: async () => ({ ok: true as const, changes: [], trusted: true }),
  };
  return service;
}

/** Opens the screen and lets the service's first answers arrive. */
async function open(service: ModelChoiceService | undefined) {
  const pick = new PickModel({
    service,
    setTimer: () => () => undefined,
    done: () => undefined,
    report: () => undefined,
  });
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  mounted.push({ root, container, pick });
  await act(async () => root.render(<PickModelScreen pick={pick} onBack={() => undefined} />));
  return container;
}

function buttonNamed(root: HTMLElement, name: string): HTMLButtonElement | undefined {
  // The kit's Button also holds its busy label, to keep its width, so the label starts its text.
  return [...root.querySelectorAll("button")].find((button) =>
    button.textContent?.startsWith(name),
  );
}

const optionRadios = (root: HTMLElement) =>
  root.querySelectorAll<HTMLInputElement>('input[type="radio"]:not([name="pick-model-provider"])');

verifies("first-run.pick-model", () => {
  it.each(["the browser demo", "a browser on halonic serve, before it has the service"])(
    "in %s, draws keys and local models off, with Sample answers ticked",
    async () => {
      const root = await open(undefined);
      const text = root.textContent ?? "";
      expect(text).toContain("Keys need the desktop app.");
      expect(text).toContain("Local models need the desktop app.");
      expect(text).not.toContain("Provider");
      expect(text).not.toContain("Get one from");
      const radios = [...root.querySelectorAll<HTMLInputElement>('input[type="radio"]')];
      expect(radios).toHaveLength(1);
      expect(radios[0]?.checked).toBe(true);
      expect(buttonNamed(root, "Continue")).toBeDefined();
      expect(text).not.toContain("Will pass");
    },
  );

  it("says a key is saved, with Replace, and shows the trust line under the button", async () => {
    const root = await open(fakeService(["anthropic"], { kind: "not-found", cause: "off" }));
    expect(root.textContent).toContain("A key is saved for Anthropic");
    expect(buttonNamed(root, "Continue")).toBeDefined();
    expect(root.textContent).toContain("Will pass 1 secret to Anthropic. Turns off Local only.");
    await act(async () => buttonNamed(root, "Replace")?.click());
    expect(root.querySelector('input[type="password"]')).not.toBeNull();
    expect(buttonNamed(root, "Test and continue")).toBeDefined();
  });

  it("gives the command and Check again when Ollama has no model", async () => {
    const root = await open(fakeService(["openai"], { kind: "none-downloaded" }));
    await act(async () => optionRadios(root)[1]?.click());
    expect(root.textContent).toContain("Ollama is running, but has no model yet.");
    expect(root.textContent).toContain("ollama pull llama3.2");
    expect(buttonNamed(root, "Check again")).toBeDefined();
  });

  it("tests the pasted key and shows a refused key in the key option", async () => {
    const service = fakeService(
      [],
      { kind: "not-found", cause: "off" },
      {
        kind: "tested",
        outcome: "key-refused",
      },
    );
    const root = await open(service);
    const field = root.querySelector<HTMLInputElement>('input[type="password"]');
    if (field) field.value = "sk-ant-pasted";
    await act(async () => buttonNamed(root, "Test and continue")?.click());
    const key = vi.mocked(service.test).mock.calls[0]?.[1] as SecretText | undefined;
    expect(key?.reveal()).toBe("sk-ant-pasted");
    expect(root.textContent).toContain("Anthropic didn't accept this key.");
  });
});
