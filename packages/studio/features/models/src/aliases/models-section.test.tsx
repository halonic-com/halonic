// @vitest-environment jsdom

import type { ItemRef, WorkspaceContext } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it } from "vitest";
import type { ModelsFiles, ProviderFile } from "../api.ts";
import { AliasTab } from "./alias-tab.tsx";
import { ModelsSection } from "./models-section.tsx";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
let element: HTMLElement | undefined;

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
    readWorkspace: async () => others.workspace ?? null,
    changeModels: () => undefined,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    change: () => {
      for (const listener of listeners) listener();
    },
  };
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
      "default · ollama / llama3.2· Runs on this machine",
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

    act(() => section.querySelectorAll("button")[2]?.click());

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
  expect(element.textContent).toContain(
    'Agents ask for "smart". Point it at any provider and model; nothing else changes.',
  );
});
