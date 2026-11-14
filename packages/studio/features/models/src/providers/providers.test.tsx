// @vitest-environment jsdom

import type { ItemRef, WorkspaceContext } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import type { ReactElement } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it } from "vitest";
import type { ModelsFiles } from "../api.ts";
import { ProviderPage } from "./provider-page.tsx";
import { ProvidersSection } from "./providers-section.tsx";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
let element: HTMLElement | undefined;

afterEach(() => {
  act(() => root?.unmount());
  element?.remove();
});

const anthropic =
  "version: 1\nid: anthropic\ntype: anthropic\nsecret: anthropic\nname: Anthropic\n";
const ollama = "version: 1\nid: ollama\nname: Ollama\ntype: ollama\nlocal: true\n";
const localOnly = "version: 1\nid: acme\nname: Acme\nprivacy: { localOnly: true }\n";

function filesWith(providers: Record<string, string>, workspace?: string): ModelsFiles {
  return {
    readModels: async () => null,
    readProviders: async () =>
      Object.entries(providers)
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([id, text]) => ({ path: `providers/${id}.yaml`, text })),
    readWorkspace: async () => workspace ?? null,
    changeModels: () => undefined,
    subscribe: () => () => undefined,
  };
}

async function show(
  view: (context: WorkspaceContext) => ReactElement,
  files: ModelsFiles,
  opened: ItemRef[] = [],
) {
  element = document.createElement("div");
  document.body.append(element);
  const context = {
    services: { get: () => files },
    openItem: (item: ItemRef) => opened.push(item),
  } as unknown as WorkspaceContext;
  root = createRoot(element);
  await act(async () => root?.render(view(context)));
  return element;
}

const workspace: ItemRef = { kind: "workspace", hub: "local", id: "settings" };
const section = (files: ModelsFiles, opened?: ItemRef[]) =>
  show((context) => <ProvidersSection item={workspace} context={context} />, files, opened);
const page = (id: string, files: ModelsFiles) =>
  show(
    (context) => (
      <ProviderPage
        item={{ kind: "model-provider", hub: "local", id }}
        context={context}
        Sections={() => null}
      />
    ),
    files,
  );

verifies("models.providers.list-and-show", () => {
  it("lists the providers by id with type and local or cloud", async () => {
    const view = await section(filesWith({ ollama, anthropic }));

    expect(view.querySelector("h2")?.textContent).toBe("Providers");
    expect([...view.querySelectorAll("li")].map((row) => row.textContent)).toEqual([
      "Anthropic · anthropic · cloud",
      "Ollama · ollama · local",
    ]);
  });

  it("opens a provider's page from its row", async () => {
    const opened: ItemRef[] = [];
    const view = await section(filesWith({ ollama }), opened);

    act(() => view.querySelector("button")?.click());

    expect(opened).toEqual([{ kind: "model-provider", hub: "local", id: "ollama" }]);
  });

  it("says so when there are no providers", async () => {
    const view = await section(filesWith({}));

    expect(view.querySelector("p")?.textContent).toContain("No providers yet.");
  });

  it("shows the type, base URL, secret name and file on a provider's page", async () => {
    const view = await page("anthropic", filesWith({ anthropic }));

    expect(view.querySelector("h1")?.textContent).toBe("Provider: Anthropic");
    expect([...view.querySelectorAll("dt, dd")].map((cell) => cell.textContent)).toEqual([
      "Type",
      "anthropic",
      "Base URL",
      "The provider's own",
      "Secret name",
      "anthropic",
      "File",
      "providers/anthropic.yaml",
    ]);
  });

  it("says a cloud provider is blocked when the workspace is local only", async () => {
    const blocked = await page("anthropic", filesWith({ anthropic }, localOnly));
    expect(blocked.querySelector("[role=alert]")?.textContent).toBe(
      "Acme is local only, so it can't use this provider.",
    );
    act(() => root?.unmount());
    element?.remove();

    const fine = await page("ollama", filesWith({ ollama }, localOnly));
    expect(fine.querySelector("[role=alert]")).toBeNull();
  });
});
