// @vitest-environment jsdom

import type { ItemRef, WorkspaceContext } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it } from "vitest";
import type { ModelsFiles } from "../api.ts";
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

function filesWith(text: string | null | Error): ModelsFiles & { change(): void } {
  const listeners = new Set<() => void>();
  return {
    readModels: async () => (text instanceof Error ? Promise.reject(text) : text),
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
      "default · ollama / llama3.2",
      "smart · anthropic / claude-sonnet-5-5",
    ]);
  });

  it("says what an alias is when there are none", async () => {
    const section = await showSection(filesWith(null));

    expect(section.textContent).toContain("No model aliases yet. An alias is a short name like");
    expect(section.querySelector("li")).toBeNull();
  });

  it("opens the alias tab of the row that is clicked", async () => {
    const opened: ItemRef[] = [];
    const section = await showSection(filesWith(twoAliases), opened);

    act(() => section.querySelectorAll("button")[1]?.click());

    expect(opened).toEqual([{ kind: "model-alias", hub: "local", id: "smart" }]);
  });

  it("reads the file again when it changes", async () => {
    const files = filesWith(twoAliases);
    const section = await showSection(files);
    files.readModels = async () => "version: 1\naliases: {}\n";

    await act(async () => files.change());

    expect(section.textContent).toContain("No model aliases yet");
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

it("titles an alias tab with the alias and says what pointing it does", () => {
  element = document.createElement("div");
  document.body.append(element);
  root = createRoot(element);
  const item = { kind: "model-alias", hub: "local", id: "smart" };
  act(() =>
    root?.render(<AliasTab item={item} context={{} as WorkspaceContext} Sections={() => null} />),
  );

  expect(element.querySelector("h1")?.textContent).toBe("Alias: smart");
  expect(element.textContent).toContain(
    'Agents ask for "smart". Point it at any provider and model; nothing else changes.',
  );
});
