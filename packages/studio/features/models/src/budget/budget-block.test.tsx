// @vitest-environment jsdom

import { KindedError } from "@halonicjs/std";
import { createToastStore, ToastStoreProvider } from "@halonicjs/studio-kit";
import { type ItemRef, limitedLookup, type WorkspaceContext } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ModelsSection } from "../aliases/models-section.tsx";
import type { ModelsFiles } from "../api.ts";
import { modelsFeature } from "../feature.ts";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
let element: HTMLElement | undefined;

beforeEach(() => {
  Element.prototype.scrollIntoView = () => {};
});

afterEach(() => {
  act(() => root?.unmount());
  element?.remove();
});

const workspaceItem: ItemRef = { kind: "workspace", hub: "local", id: "settings" };
const header = "version: 1\nid: acme\nname: Acme\n";
const cloud = "version: 1\nid: anthropic\ntype: anthropic\nsecret: anthropic-key\n";
const local = "version: 1\nid: ollama\ntype: ollama\n";

/** A workspace whose `workspace.yaml` changes the way the app's files do: each change is one step. */
function setup(workspace: string, providers: Record<string, string>) {
  let text = workspace;
  const listeners = new Set<() => void>();
  const changes: { label: string; text: string }[] = [];
  const files: ModelsFiles = {
    readModels: async () => "version: 1\naliases: {}\n",
    readProviders: async () =>
      Object.entries(providers).map(([id, body]) => ({ path: `providers/${id}.yaml`, text: body })),
    readProvider: async () => null,
    readWorkspace: async () => text,
    changeModels: () => undefined,
    changeProvider: () => undefined,
    changeWorkspace: (label, next) => {
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

async function show(files: ModelsFiles) {
  const toasts = createToastStore();
  element = document.createElement("div");
  document.body.append(element);
  const context = {
    services: limitedLookup(modelsFeature, { get: () => files }),
  } as unknown as WorkspaceContext;
  root = createRoot(element);
  await act(async () =>
    root?.render(
      <ToastStoreProvider store={toasts}>
        <ModelsSection item={workspaceItem} context={context} />
      </ToastStoreProvider>,
    ),
  );
  return { section: element, toasts };
}

function button(parent: HTMLElement, text: string): HTMLButtonElement {
  const found = [...parent.querySelectorAll("button")].find((b) => b.textContent === text);
  if (found === undefined) throw new Error(`no button "${text}"`);
  return found;
}

async function type(input: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

const blockOf = (section: HTMLElement) =>
  section.querySelector<HTMLElement>("section[aria-labelledby]:has(h3)") as HTMLElement;

verifies("models.budget.budget-settings", () => {
  describe("what the block says", () => {
    it("says the amounts that are set, with Change", async () => {
      const { files } = setup(`${header}budget: { currency: EUR, perRun: 5, monthly: 50 }\n`, {
        anthropic: cloud,
      });
      const { section } = await show(files);

      expect(blockOf(section).textContent).toContain("€5.00 per run · €50.00 per month");
      expect(button(blockOf(section), "Change")).toBeDefined();
    });

    it("names up to three providers without a budget, then counts the rest", async () => {
      const providers = Object.fromEntries(
        ["a", "b", "c", "d", "e"].map((id) => [
          id,
          `version: 1\nid: ${id}\ntype: anthropic\nsecret: k-${id}\n`,
        ]),
      );
      const { section } = await show(setup(header, providers).files);

      expect(blockOf(section).textContent).toContain("No budget set for a, b, c +2 more");
      expect(button(blockOf(section), "Set budget")).toBeDefined();
    });

    it("is not there when nothing may bill per use, and a currency alone is no budget", async () => {
      const { section } = await show(
        setup(`${header}budget: { currency: USD }\n`, { ollama: local }).files,
      );

      expect(section.textContent).not.toContain("Budget");
    });
  });

  describe("changing the budget", () => {
    it("saves both amounts as one step, toasts it, and Undo puts the old text back", async () => {
      const { files, changes } = setup(header, { anthropic: cloud });
      const { section, toasts } = await show(files);

      await act(async () => button(section, "Set budget").click());
      const [perRun, monthly] = section.querySelectorAll("input");
      expect(document.activeElement).toBe(perRun);
      await type(perRun as HTMLInputElement, "5");
      await type(monthly as HTMLInputElement, "50,00");
      await act(async () => button(section, "Save").click());

      expect(changes).toHaveLength(1);
      expect(changes[0]?.text).toContain("perRun: 5");
      expect(changes[0]?.text).toContain("monthly: 50");
      expect(toasts.list()[0]?.title).toBe("Budget set: €5.00 per run · €50.00 per month");
      expect(document.activeElement?.textContent).toBe("Change");

      await act(async () => toasts.list()[0]?.action?.onClick());
      expect(changes[1]).toEqual({ label: "Budget change undone", text: header });
    });

    it("says Remove budget when both fields are empty and removes the budget", async () => {
      const { files, changes } = setup(`${header}budget:\n  currency: EUR\n  monthly: 50\n`, {
        anthropic: cloud,
      });
      const { section, toasts } = await show(files);

      await act(async () => button(section, "Change").click());
      const [, monthly] = section.querySelectorAll("input");
      expect((monthly as HTMLInputElement).value).toBe("50");
      await type(monthly as HTMLInputElement, "");
      await act(async () =>
        section.querySelector("form")?.dispatchEvent(new Event("submit", { bubbles: true })),
      );

      expect(changes[0]?.text).not.toContain("monthly");
      expect(toasts.list()[0]?.title).toBe("Removed the budget");
    });

    it("puts focus back on Set budget after Cancel", async () => {
      const { section } = await show(setup(header, { anthropic: cloud }).files);
      await act(async () => button(section, "Set budget").click());
      await act(async () => button(section, "Cancel").click());

      expect(document.activeElement?.textContent).toBe("Set budget");
    });

    it("removes the last budget, keeps the block and puts focus on Set budget", async () => {
      const { files, changes } = setup(`${header}budget:\n  monthly: 50\n`, { ollama: local });
      const { section } = await show(files);
      await act(async () => button(section, "Change").click());
      await type(section.querySelectorAll("input")[1] as HTMLInputElement, "");
      await act(async () => button(section, "Remove budget").click());

      expect(changes[0]?.text).toBe(header);
      expect(blockOf(section).textContent).toContain("No budget set");
      expect(document.activeElement?.textContent).toBe("Set budget");
    });

    it("names a yaml problem once and clears a field's error when it is edited", async () => {
      const { files } = setup(header, { anthropic: cloud });
      const { section } = await show(files);
      await act(async () => button(section, "Set budget").click());
      const [perRun] = section.querySelectorAll("input");
      await type(perRun as HTMLInputElement, "0");
      await act(async () => button(section, "Save").click());
      expect(section.textContent).toContain("Enter an amount above 0");

      await type(perRun as HTMLInputElement, "1");
      expect(section.textContent).not.toContain("Enter an amount above 0");
    });

    it("says a save that failed, with its reason, and Try again saves it", async () => {
      const { files, changes } = setup(header, { anthropic: cloud });
      const { section } = await show(files);
      await act(async () => button(section, "Set budget").click());
      const [perRun] = section.querySelectorAll("input");
      await type(perRun as HTMLInputElement, "5");
      const read = files.readWorkspace;
      (files as { readWorkspace: ModelsFiles["readWorkspace"] }).readWorkspace = () =>
        Promise.reject(new KindedError("unavailable", "The disk is full."));
      await act(async () => button(section, "Save").click());

      expect(changes).toHaveLength(0);
      expect(section.querySelector('[role="status"]')?.textContent).toBe(
        "Couldn't save the budget: the disk is full.Try again",
      );

      (files as { readWorkspace: ModelsFiles["readWorkspace"] }).readWorkspace = read;
      await act(async () => button(section, "Try again").click());
      expect(changes).toHaveLength(1);
      expect(section.textContent).not.toContain("Couldn't save the budget");
    });

    it("does not offer Undo once the file changed meanwhile", async () => {
      const { files, changes } = setup(header, { anthropic: cloud });
      const { section, toasts } = await show(files);
      await act(async () => button(section, "Set budget").click());
      await type(section.querySelectorAll("input")[1] as HTMLInputElement, "20");
      await act(async () => button(section, "Save").click());

      files.changeWorkspace("Other change", `${header}# other\n`);
      await act(async () => toasts.list()[0]?.action?.onClick());

      expect(changes.map((change) => change.label)).toEqual([
        "Budget set: €20.00 per month",
        "Other change",
      ]);
    });

    it("writes nothing for an amount that isn't above 0 and says so under the field", async () => {
      const { files, changes } = setup(header, { anthropic: cloud });
      const { section } = await show(files);
      await act(async () => button(section, "Set budget").click());
      await type(section.querySelector("input") as HTMLInputElement, "0");
      await act(async () => button(section, "Save").click());

      expect(changes).toEqual([]);
      expect(section.textContent).toContain(
        "Enter an amount above 0, like you'd write it on a receipt.",
      );
      await act(async () => button(section, "Cancel").click());
      expect(section.querySelector("form")).toBeNull();
    });

    it("names the fields with their currency and notes a per-run amount above the monthly one", async () => {
      const { files } = setup(`${header}budget: { currency: USD, monthly: 10 }\n`, {
        anthropic: cloud,
      });
      const { section } = await show(files);
      await act(async () => button(section, "Change").click());
      await type(section.querySelector("input") as HTMLInputElement, "20");

      const labels = [...section.querySelectorAll("label")].map((label) => label.textContent);
      expect(labels.join(" ")).toContain("Per run");
      expect(labels.join(" ")).toContain("in US dollars");
      expect(section.textContent).toContain("Per run is higher than per month.");
    });
  });
});
