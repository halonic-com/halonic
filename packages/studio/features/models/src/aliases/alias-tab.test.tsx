// @vitest-environment jsdom

import type { ItemRef, WorkspaceContext } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it } from "vitest";
import type { ModelsFiles } from "../api.ts";
import { AliasTab } from "./alias-tab.tsx";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
let element: HTMLElement | undefined;

afterEach(() => {
  act(() => root?.unmount());
  element?.remove();
});

const smart: ItemRef = { kind: "model-alias", hub: "local", id: "smart" };

const workspaceModels = `version: 1
aliases:
  smart:
    provider: anthropic
    model: claude-sonnet-5-5
    price: { input: 3, output: 15, cacheRead: 0.3 }
  default: { provider: ollama, model: llama3.2 }
  fast: { provider: openai, model: gpt-5-mini }
`;

/** A `models.yaml` in memory that tells the tab about each change, as the app's files do. */
function memoryFiles(initial: string) {
  let text = initial;
  const listeners = new Set<() => void>();
  const changes: { label: string; text: string }[] = [];
  const files: ModelsFiles = {
    readModels: async () => text,
    changeModels: (label, next) => {
      text = next;
      changes.push({ label, text: next });
      for (const listener of listeners) listener();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return { files, changes };
}

async function showTab(files: ModelsFiles, item: ItemRef = smart): Promise<HTMLElement> {
  element = document.createElement("div");
  document.body.append(element);
  const context = { services: { get: () => files } } as unknown as WorkspaceContext;
  root = createRoot(element);
  await act(async () =>
    root?.render(<AliasTab item={item} context={context} Sections={() => null} />),
  );
  return element;
}

function field(tab: HTMLElement, label: string): HTMLInputElement {
  const found = [...tab.querySelectorAll("label")].find((l) => l.textContent?.startsWith(label));
  const control = found && tab.querySelector<HTMLInputElement>(`#${CSS.escape(found.htmlFor)}`);
  if (!control) throw new Error(`no field ${label}`);
  return control;
}

async function typeInto(input: HTMLInputElement, value: string): Promise<void> {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => {
    input.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
  });
}

verifies("models.aliases.list", () => {
  it("titles an alias tab with the alias and says what pointing it does", async () => {
    const tab = await showTab(memoryFiles(workspaceModels).files);

    expect(tab.querySelector("h1")?.textContent).toBe("Alias: smart");
    expect(tab.textContent).toContain(
      'Agents ask for "smart". Point it at any provider and model; nothing else changes.',
    );
  });

  it("says so when the alias is no longer in models.yaml", async () => {
    const tab = await showTab(memoryFiles(workspaceModels).files, { ...smart, id: "gone" });

    expect(tab.textContent).toContain("This alias is no longer in models.yaml.");
  });
});

verifies("models.aliases.edit-target", () => {
  it("saves a new model name and says so", async () => {
    const { files, changes } = memoryFiles(workspaceModels);
    const tab = await showTab(files);

    await typeInto(field(tab, "Model"), "claude-opus-5-5");

    expect(changes).toHaveLength(1);
    expect(changes[0]?.label).toBe("Updated model alias smart");
    expect(changes[0]?.text).toContain("claude-opus-5-5");
    expect(tab.querySelector("[role=status]")?.textContent).toBe("Updated model alias smart");
  });

  it("writes nothing for an empty model name and offers the old one back", async () => {
    const { files, changes } = memoryFiles(workspaceModels);
    const tab = await showTab(files);

    await typeInto(field(tab, "Model"), "  ");

    expect(changes).toEqual([]);
    expect(tab.textContent).toContain("Give the model a name. Put back claude-sonnet-5-5.");
  });
});

verifies("models.aliases.edit-fallbacks", () => {
  it("hints at the other aliases and saves the list that was typed", async () => {
    const { files, changes } = memoryFiles(workspaceModels);
    const tab = await showTab(files);
    expect(tab.textContent).toContain(
      "Tried in order when this fails. Other aliases: default, fast",
    );

    await typeInto(field(tab, "Fallbacks"), " default, , fast ");

    expect(changes[0]?.text).toMatch(
      /fallback:\s*\n?\s*- default\s*\n\s*- fast|fallback: \[default, fast\]/,
    );
  });
});

verifies("models.aliases.edit-price", () => {
  it("saves prices read as an amount and keeps the cache prices", async () => {
    const { files, changes } = memoryFiles(workspaceModels);
    const tab = await showTab(files);

    await typeInto(field(tab, "Input"), "4,50");

    expect(changes[0]?.text).toContain("input: 4.5");
    expect(changes[0]?.text).toContain("cacheRead: 0.3");
  });

  it("refuses an amount that isn't one and writes nothing", async () => {
    const { files, changes } = memoryFiles(workspaceModels);
    const tab = await showTab(files);

    await typeInto(field(tab, "Output"), "1.000,50");

    expect(changes).toEqual([]);
    expect(tab.textContent).toContain("Enter an amount, like you'd write it on a receipt.");
  });

  it("warns that emptying both prices also removes the cache prices", async () => {
    const tab = await showTab(memoryFiles(workspaceModels).files);
    expect(tab.textContent).not.toContain("cache prices");

    await act(async () => {
      for (const label of ["Input", "Output"]) {
        const input = field(tab, label);
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, "");
        input.dispatchEvent(new Event("input", { bubbles: true }));
      }
    });

    expect(tab.textContent).toContain("also removes this alias's cache prices");
  });
});
