// @vitest-environment jsdom

import { settlePendingSaves } from "@halonicjs/studio-kit";
import { type ItemRef, limitedLookup, type WorkspaceContext } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import type { ReactElement } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it } from "vitest";
import type { ModelsFiles } from "../api.ts";
import { modelsFeature } from "../feature.ts";
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
    readProvider: async () => null,
    changeProvider: () => undefined,
    readWorkspace: async () => workspace ?? null,
    changeModels: () => undefined,
    changeWorkspace: () => undefined,
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
    services: limitedLookup(modelsFeature, { get: () => files, find: () => undefined }),
    openItem: (item: ItemRef) => opened.push(item),
  } as unknown as WorkspaceContext;
  root = createRoot(element);
  await act(async () => root?.render(view(context)));
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

  it("shows the fields, and no file line, on a provider's page", async () => {
    const view = await page("anthropic", filesWith({ anthropic }));

    expect(view.querySelector("h1")?.textContent).toBe("Anthropic");
    expect(view.querySelector("h1")?.previousElementSibling?.textContent).toBe("Provider");
    const values = [...view.querySelectorAll<HTMLInputElement>("input:not([role=switch])")].map(
      (input) => input.value,
    );
    expect(values).toEqual(["Anthropic", "", "anthropic"]);
    expect(view.querySelector("select")?.value).toBe("anthropic");
    expect(view.querySelector<HTMLInputElement>("input[placeholder]")?.placeholder).toBe(
      "The provider's own",
    );
    expect(view.textContent).not.toContain("File:");
    expect(view.textContent).toContain("This computer or your own network");
  });

  it("says so, naming the file, when the providers can't be read or a file doesn't parse", async () => {
    const failing = { ...filesWith({}), readProviders: async () => Promise.reject(new Error("x")) };
    const failed = await section(failing);
    expect(failed.textContent).toContain("Couldn't load providers");
    expect(failed.textContent).not.toContain("No providers yet");
    expect(failed.textContent).toContain("Try again");
    act(() => root?.unmount());
    element?.remove();

    const broken = filesWith({ ollama, anthropic: "version: 1\ntype: [\n" });
    const list = await section(broken);
    expect(list.textContent).toContain("providers/anthropic.yaml");
    expect(list.textContent).toContain("Ollama · ollama · local");
    act(() => root?.unmount());
    element?.remove();

    const view = await page("anthropic", broken);
    expect(view.textContent).toContain("Halonic couldn't read providers/anthropic.yaml");
    expect(view.textContent).not.toContain("no longer in providers/");
    expect(view.textContent).toContain("Try again");
    act(() => root?.unmount());
    element?.remove();

    const gone = await page("anthropic", failing);
    expect(gone.textContent).toContain("Couldn't load providers");
    expect(gone.textContent).not.toContain("no longer in providers/");
    expect(gone.textContent).toContain("Try again");
  });

  it("still lists providers and shows their pages when models.yaml does not parse", async () => {
    const broken = { ...filesWith({ anthropic }), readModels: async () => "aliases: [\n" };

    const list = await section(broken);
    expect([...list.querySelectorAll("li")].map((row) => row.textContent)).toEqual([
      "Anthropic · anthropic · cloud",
    ]);
    act(() => root?.unmount());
    element?.remove();

    const view = await page("anthropic", broken);
    expect(view.querySelector("h1")?.textContent).toBe("Anthropic");
  });

  it("saves a base URL when the field is left, and shows a bad one's problem instead", async () => {
    const saved: { label: string; text: string }[] = [];
    const files = {
      ...filesWith({ ollama }),
      readProvider: async () => ollama,
      changeProvider: (_path: string, label: string, text: string) => saved.push({ label, text }),
    };
    const view = await page("ollama", files);
    const baseUrl = view.querySelectorAll("input")[1] as HTMLInputElement;

    await typeAndLeave(baseUrl, "localhost:11434");
    expect(saved).toEqual([]);
    expect(view.textContent).toContain("Enter a full address");

    await typeAndLeave(baseUrl, "http://localhost:11434/v1");
    expect(saved.map(({ label }) => label)).toEqual(["Updated provider Ollama"]);
    expect(saved[0]?.text).toContain("baseUrl: http://localhost:11434/v1");
  });

  it("registers a field's save with the window close while the file is still being read", async () => {
    let release: (text: string) => void = () => undefined;
    const saved: string[] = [];
    const files = {
      ...filesWith({ ollama }),
      readProvider: () => new Promise<string>((resolve) => (release = resolve)),
      changeProvider: (_path: string, _label: string, text: string) => saved.push(text),
    };
    const view = await page("ollama", files);
    const baseUrl = view.querySelectorAll("input")[1] as HTMLInputElement;
    await typeAndLeave(baseUrl, "http://localhost:11434/v1");
    expect(saved).toEqual([]);

    const settled = settlePendingSaves();
    await act(async () => release(ollama));
    await settled;

    expect(saved).toHaveLength(1);
  });

  it("refuses a pasted key as the secret name without writing it or showing it", async () => {
    const key = `sk-ant-api03-${"Q7x2Lm9K".repeat(4)}`;
    const saved: string[] = [];
    const files = {
      ...filesWith({ anthropic }),
      readProvider: async () => anthropic,
      changeProvider: (_path: string, _label: string, text: string) => saved.push(text),
    };
    const view = await page("anthropic", files);
    const secret = view.querySelectorAll("input")[2] as HTMLInputElement;

    await typeAndLeave(secret, key);

    expect(saved).toEqual([]);
    expect(view.textContent).toContain("looks like an API key");
    expect(view.textContent).not.toContain(key);
  });

  it("keeps a refused field's problem showing when another field saves", async () => {
    const saved: string[] = [];
    const files = {
      ...filesWith({ ollama }),
      readProvider: async () => ollama,
      changeProvider: (_path: string, _label: string, text: string) => saved.push(text),
    };
    const view = await page("ollama", files);
    const inputs = view.querySelectorAll("input");

    await typeAndLeave(inputs[1] as HTMLInputElement, "localhost:11434");
    await typeAndLeave(inputs[0] as HTMLInputElement, "My Ollama");

    expect(saved).toHaveLength(1);
    expect(view.textContent).toContain("Enter a full address");
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
