// @vitest-environment jsdom

import type { ItemRef, WorkspaceContext } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it } from "vitest";
import {
  type ModelKeys,
  ModelKeysService,
  type ModelsFiles,
  type NoLimitMemory,
  NoLimitMemoryService,
} from "../api.ts";
import { ProviderPage } from "../providers/provider-page.tsx";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
let element: HTMLElement | undefined;

beforeEach(() => {
  HTMLDialogElement.prototype.showModal ??= function showModal(this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close ??= function close(this: HTMLDialogElement) {
    this.removeAttribute("open");
  };
});

afterEach(() => {
  act(() => root?.unmount());
  element?.remove();
});

const ollama =
  "version: 1\nid: ollama\nname: Ollama\ntype: ollama\nbaseUrl: http://localhost:11434/v1\n";
const anthropic =
  "version: 1\nid: anthropic\nname: Anthropic\ntype: anthropic\nsecret: anthropic\n";
const models = "version: 1\naliases:\n  smart: { provider: ollama, model: m }\n";

/** Files that keep what is written and tell the page, like the app does. */
function fakeFiles(provider: string, id: string, extra: { models?: string; workspace?: string }) {
  let text = provider;
  const listeners = new Set<() => void>();
  const files: ModelsFiles = {
    readModels: async () => extra.models ?? models,
    readProviders: async () => [{ path: `providers/${id}.yaml`, text }],
    readProvider: async () => text,
    changeProvider: (_path, _label, next) => {
      text = next;
      for (const listener of listeners) listener();
    },
    readWorkspace: async () => extra.workspace ?? "version: 1\nname: Acme\n",
    changeModels: () => undefined,
    changeWorkspace: () => undefined,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return files;
}

async function show(id: string, files: ModelsFiles, keys?: ModelKeys, memory?: NoLimitMemory) {
  element = document.createElement("div");
  document.body.append(element);
  const find = (key: unknown) => {
    if (key === ModelKeysService) return keys;
    return key === NoLimitMemoryService ? memory : undefined;
  };
  const context = {
    services: { get: () => files, find },
    openItem: (_item: ItemRef) => undefined,
  } as unknown as WorkspaceContext;
  root = createRoot(element);
  await act(async () =>
    root?.render(
      <ProviderPage
        item={{ kind: "model-provider", hub: "local", id }}
        context={context}
        Sections={() => null}
      />,
    ),
  );
  return element;
}

async function typeAndLeave(input: HTMLInputElement, value: string) {
  await act(async () => {
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    set?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => {
    input.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
  });
}

const stepOpen = () => document.body.textContent?.includes("Prices and budget") ?? false;

const keysWith = (stored: boolean): ModelKeys => ({
  entry: { kind: "field", keptOn: "this-computer", offHostHttps: false },
  stored: async () => stored,
  save: async () => undefined,
  remove: async () => undefined,
});

async function saveKey(view: HTMLElement) {
  const input = view.querySelector<HTMLInputElement>("input[type=password]");
  if (input === null) throw new Error("no key field");
  await typeAndLeave(input, "a-key");
  const button = [...view.querySelectorAll("button")].find((b) =>
    b.textContent?.includes("Save key"),
  );
  await act(async () => button?.click());
}

verifies("models.budget-step.ask-for-pay-per-use", () => {
  it("offers the step when an edit makes the provider pay-per-use", async () => {
    const view = await show("ollama", fakeFiles(ollama, "ollama", {}));
    expect(stepOpen()).toBe(false);

    await typeAndLeave(view.querySelectorAll("input")[2] as HTMLInputElement, "ollama-key");

    expect(stepOpen()).toBe(true);
  });

  it("does not offer it for an edit that leaves the provider as it was", async () => {
    const view = await show("anthropic", fakeFiles(anthropic, "anthropic", {}));

    await typeAndLeave(view.querySelectorAll("input")[0] as HTMLInputElement, "Claude");

    expect(stepOpen()).toBe(false);
  });

  it("offers it after the first key is saved, but not after a replacement", async () => {
    const first = await show("anthropic", fakeFiles(anthropic, "anthropic", {}), keysWith(false));
    await saveKey(first);
    expect(stepOpen()).toBe(true);
  });

  it("does not offer it when a key replaces one", async () => {
    const view = await show("anthropic", fakeFiles(anthropic, "anthropic", {}), keysWith(true));
    await saveKey(view);
    const confirm = [...document.body.querySelectorAll("button")].find((b) =>
      b.textContent?.includes("Change key"),
    );
    expect(confirm).toBeDefined();
    await act(async () => confirm?.click());
    expect(stepOpen()).toBe(false);
  });
});

verifies("models.budget-step.no-limit-remembered", () => {
  it("does not offer it again for a provider and host with No limit remembered", async () => {
    const memory: NoLimitMemory = { remembered: () => true, remember: () => undefined };
    const view = await show(
      "anthropic",
      fakeFiles(`${anthropic}baseUrl: https://api.anthropic.com/v1\n`, "anthropic", {}),
      keysWith(false),
      memory,
    );

    await saveKey(view);

    expect(stepOpen()).toBe(false);
  });

  it("remembers No limit for the provider and its host", async () => {
    const remembered: string[][] = [];
    const memory: NoLimitMemory = {
      remembered: () => false,
      remember: (id, host) => remembered.push([id, host]),
    };
    const view = await show(
      "anthropic",
      fakeFiles(`${anthropic}baseUrl: https://api.anthropic.com/v1\n`, "anthropic", {}),
      keysWith(false),
      memory,
    );
    await saveKey(view);

    const noLimit = [...document.body.querySelectorAll("button")].find((b) =>
      b.textContent?.includes("No limit"),
    );
    await act(async () => noLimit?.click());

    expect(remembered).toEqual([["anthropic", "api.anthropic.com"]]);
    expect(stepOpen()).toBe(false);
  });
});
