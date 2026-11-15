// @vitest-environment jsdom

import type { ItemRef, WorkspaceContext } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it } from "vitest";
import type { ModelsFiles, ProviderFile } from "../api.ts";
import { AliasTab } from "./alias-tab.tsx";
import { ModelsSection } from "./models-section.tsx";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
let element: HTMLElement | undefined;

beforeEach(() => {
  // jsdom has `<dialog>` but no `showModal()`; opening it is all these tests need.
  Object.assign(HTMLDialogElement.prototype, {
    showModal(this: HTMLDialogElement) {
      this.setAttribute("open", "");
    },
    close(this: HTMLDialogElement) {
      this.removeAttribute("open");
    },
  });
  Element.prototype.scrollIntoView = () => {};
});

afterEach(() => {
  act(() => root?.unmount());
  element?.remove();
});

const workspace: ItemRef = { kind: "workspace", hub: "local", id: "settings" };

const twoAliases = `version: 1
aliases:
  smart: { provider: anthropic, model: claude-sonnet-5-5 }
  default: { provider: ollama, model: llama3.2 }
`;

function providerFiles(byId: Record<string, string> = {}): ProviderFile[] {
  return Object.entries(byId).map(([id, text]) => ({ path: `providers/${id}.yaml`, text }));
}

function filesWith(
  text: string | null | Error,
  others: { workspace?: string; providers?: Record<string, string> } = {},
): ModelsFiles & { change(): void } {
  const listeners = new Set<() => void>();
  return {
    readModels: async () => (text instanceof Error ? Promise.reject(text) : text),
    readProviders: async () => providerFiles(others.providers),
    readProvider: async () => null,
    changeProvider: () => undefined,
    readWorkspace: async () => others.workspace ?? null,
    changeModels: () => undefined,
    changeWorkspace: () => undefined,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    change: () => {
      for (const listener of listeners) listener();
    },
  };
}

function buttonNamed(parent: HTMLElement, text: string): HTMLButtonElement | undefined {
  return [...parent.querySelectorAll("button")].find((b) => b.textContent === text);
}

async function showSection(files: ModelsFiles, opened: ItemRef[] = []): Promise<HTMLElement> {
  element = document.createElement("div");
  document.body.append(element);
  const context = {
    services: { get: () => files },
    openItem: (item: ItemRef) => opened.push(item),
  } as unknown as WorkspaceContext;
  root = createRoot(element);
  await act(async () => root?.render(<ModelsSection item={workspace} context={context} />));
  return element;
}

verifies("models.aliases.list", () => {
  it("lists the aliases by name with provider / model", async () => {
    const section = await showSection(filesWith(twoAliases));

    expect(section.querySelector("h2")?.textContent).toBe("Models");
    expect([...section.querySelectorAll("li")].map((row) => row.textContent)).toEqual([
      "default · ollama / llama3.2· No price ·Add a price",
      "smart · anthropic / claude-sonnet-5-5· No price ·Add a price",
    ]);
  });

  it("says a local model with no price runs on this machine, with nothing to add", async () => {
    const files = filesWith(twoAliases, {
      providers: { ollama: "version: 1\nid: ollama\ntype: ollama\nlocal: true\n" },
    });
    const section = await showSection(files);

    expect([...section.querySelectorAll("li")].map((row) => row.textContent)).toEqual([
      "default · ollama / llama3.2· Runs on this computer",
      "smart · anthropic / claude-sonnet-5-5· No price ·Add a price",
    ]);
    expect(section.querySelector("[aria-label='Add a price for smart']")).not.toBeNull();
    expect(section.querySelector("[aria-label='Add a price for default']")).toBeNull();
  });

  it("writes prices in the workspace's budget currency", async () => {
    const files = filesWith(
      "version: 1\naliases:\n  smart: { provider: anthropic, model: m, price: { input: 3, output: 15 } }\n",
      { workspace: "version: 1\nid: acme\nname: Acme\nbudget: { currency: USD }\n" },
    );
    const section = await showSection(files);

    expect(section.querySelector("li")?.textContent).toContain(
      "$3.00 in · $15.00 out per million tokens",
    );
    expect(section.textContent).not.toContain("€");
  });

  it("says what an alias is when there are none", async () => {
    const section = await showSection(filesWith(null));

    expect(section.textContent).toContain("No model aliases yetAn alias is a short name like fast");
    expect(section.querySelector("li")).toBeNull();
    expect(section.querySelector("code")?.textContent).toBe("fast");
    expect(section.textContent).not.toContain("`");
  });

  it("says Loading models while it reads", async () => {
    const files = filesWith(twoAliases);
    files.readModels = () => new Promise(() => undefined);
    const section = await showSection(files);

    expect(section.textContent).toContain("Loading models");
  });

  it("reads again on Try again", async () => {
    const files = filesWith(new Error("gone"));
    const section = await showSection(files);
    expect(section.textContent).toContain("Couldn't load models");
    files.readModels = async () => twoAliases;

    const retry = [...section.querySelectorAll("button")].find(
      (b) => b.textContent === "Try again",
    );
    await act(async () => retry?.click());

    expect(section.textContent).toContain("smart · anthropic");
  });

  it("opens the alias tab of the row that is clicked", async () => {
    const opened: ItemRef[] = [];
    const section = await showSection(filesWith(twoAliases), opened);

    act(() => buttonNamed(section, "smart · anthropic / claude-sonnet-5-5")?.click());

    expect(opened).toEqual([{ kind: "model-alias", hub: "local", id: "smart" }]);
  });

  it("reads the file again when it changes", async () => {
    const files = filesWith(twoAliases);
    const section = await showSection(files);
    files.readModels = async () => "version: 1\naliases: {}\n";

    await act(async () => files.change());

    expect(section.textContent).toContain("No model aliases yet");
  });

  it("shows the newest read when an older one finishes late", async () => {
    const files = filesWith(twoAliases);
    let finishOld: (text: string) => void = () => undefined;
    files.readModels = () => new Promise((resolve) => (finishOld = resolve));
    const section = await showSection(files);
    files.readModels = async () => "version: 1\naliases: {}\n";
    await act(async () => files.change());

    await act(async () => finishOld(twoAliases));

    expect(section.textContent).toContain("No model aliases yet");
    expect(section.querySelector("li")).toBeNull();
  });

  it("says so when the file can't be read", async () => {
    const section = await showSection(filesWith("aliases: [not, a, map"));

    expect(section.textContent).toContain("Halonic couldn't read the model aliases.");
  });

  it("says so when the file can't be reached", async () => {
    const section = await showSection(filesWith(new Error("gone")));

    expect(section.textContent).toContain("Halonic couldn't read the model aliases.");
  });
});

verifies("models.aliases.create", () => {
  function memory(initial: string | null) {
    const files = filesWith(initial);
    const changes: { label: string; text: string }[] = [];
    files.changeModels = (label, text) => changes.push({ label, text });
    return { files, changes };
  }

  async function typeInto(input: HTMLInputElement, value: string) {
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }

  const dialogInput = (label: string) => {
    const found = [...document.querySelectorAll("label")].find((l) =>
      l.textContent?.startsWith(label),
    );
    return document.querySelector<HTMLInputElement>(`#${CSS.escape(found?.htmlFor ?? "")}`);
  };

  async function openDialog(initial: string | null, opened: ItemRef[] = []) {
    const { files, changes } = memory(initial);
    const section = await showSection(files, opened);
    await act(async () => buttonNamed(section, "New alias")?.click());
    return { section, changes };
  }

  const create = () =>
    act(async () => {
      const button = [...document.querySelectorAll("dialog button")].find((b) =>
        b.textContent?.startsWith("Create"),
      );
      (button as HTMLButtonElement | undefined)?.click();
    });

  it("offers New alias in the header and in the empty state", async () => {
    const { section } = await openDialog(null);

    expect(buttonNamed(section, "New alias")).toBeDefined();
    expect(document.querySelector("dialog")?.textContent).toContain("New model alias");
    expect(document.querySelector("dialog")?.textContent).toContain(
      "Agents ask for this name, like fast.",
    );
  });

  it("asks for a provider when there are no provider files, and writes nothing", async () => {
    const { changes } = await openDialog(null);

    await typeInto(dialogInput("Name") as HTMLInputElement, "fast");
    await typeInto(dialogInput("Model") as HTMLInputElement, "llama3.2");
    await create();

    expect(document.querySelector("dialog")?.textContent).toContain("Pick a provider.");
    expect(changes).toHaveLength(0);

    await typeInto(dialogInput("Provider") as HTMLInputElement, "ollama");
    await create();

    expect(changes).toHaveLength(1);
  });

  it("names the providers in the list as the design does, and saves the id", async () => {
    const files = filesWith(twoAliases, {
      providers: {
        ollama: "version: 1\nid: ollama\nname: Ollama\ntype: ollama\nlocal: true\n",
        test: "version: 1\nid: test\nname: Test model\ntype: mock\n",
      },
    });
    const changes: { label: string; text: string }[] = [];
    files.changeModels = (label, text) => changes.push({ label, text });
    const section = await showSection(files);
    await act(async () => buttonNamed(section, "New alias")?.click());

    // The first provider, anthropic, has no file and shows its id.
    expect(document.querySelector("dialog")?.textContent).toContain("anthropic");
    await act(async () => {
      document
        .querySelector<HTMLElement>("dialog [role=combobox], dialog button[aria-haspopup]")
        ?.click();
    });
    const shown = document.body.textContent ?? "";
    expect(shown).toContain("Ollama (local)");
    expect(shown).toContain("Test model (built-in)");
  });

  it("adds the alias as one undo step and opens its tab", async () => {
    const opened: ItemRef[] = [];
    const { changes } = await openDialog(twoAliases, opened);

    await typeInto(dialogInput("Name") as HTMLInputElement, "cheap");
    await typeInto(dialogInput("Model") as HTMLInputElement, "gpt-5-nano");
    await create();

    expect(changes).toHaveLength(1);
    expect(changes[0]?.label).toBe("Added model alias cheap");
    expect(changes[0]?.text).toMatch(/cheap:\s+provider: anthropic\s+model: gpt-5-nano/);
    expect(opened).toEqual([{ kind: "model-alias", hub: "local", id: "cheap" }]);
    expect(document.querySelector("dialog")).toBeNull();
  });

  it("keeps the dialog open and writes nothing while a field is wrong", async () => {
    const { changes } = await openDialog(twoAliases);

    await create();
    expect(document.querySelector("dialog")?.textContent).toContain("Give it a name.");

    await typeInto(dialogInput("Name") as HTMLInputElement, "smart");
    await create();
    expect(document.querySelector("dialog")?.textContent).toContain(
      "There's already a model alias called smart.",
    );

    await typeInto(dialogInput("Name") as HTMLInputElement, "cheap");
    await create();
    expect(document.querySelector("dialog")?.textContent).toContain(
      "Give the model's name, like claude-sonnet-5-5.",
    );
    expect(changes).toEqual([]);
  });

  it("says Nothing was changed when the file can't be read", async () => {
    const { changes } = await openDialog("aliases: [not, a, map");

    await typeInto(dialogInput("Name") as HTMLInputElement, "cheap");
    await typeInto(dialogInput("Model") as HTMLInputElement, "m");
    await create();
    await act(async () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));

    expect(document.querySelector("dialog")?.textContent).toContain(
      "Couldn't create the model alias:",
    );
    expect(document.querySelector("dialog")?.textContent).toContain("Nothing was changed.");
    expect(changes).toEqual([]);
  });
});

it("titles an alias tab with the alias and says what pointing it does", async () => {
  element = document.createElement("div");
  document.body.append(element);
  root = createRoot(element);
  const item = { kind: "model-alias", hub: "local", id: "smart" };
  const files = filesWith(twoAliases);
  const context = { services: { get: () => files } } as unknown as WorkspaceContext;
  await act(async () =>
    root?.render(<AliasTab item={item} context={context} Sections={() => null} />),
  );

  expect(element.querySelector("h1")?.textContent).toBe("Alias: smart");
  expect(element.querySelector("h1 .font-mono")?.textContent).toBe("smart");
  expect(element.textContent).toContain(
    'Agents ask for "smart". Point it at any provider and model; nothing else changes.',
  );
});
