// @vitest-environment jsdom

import {
  createShell,
  defineFeature,
  type ItemRef,
  type OpenItemOptions,
} from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import {
  type ModelKeys,
  ModelKeysService,
  type ModelsFiles,
  ModelsFilesService,
  ModelsService,
} from "../api.ts";
import { modelsFeature } from "../feature.ts";
import { PageOpenerHost } from "./page-opener-host.tsx";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let mounted: { root: Root; element: HTMLElement } | undefined;

afterEach(() => {
  const done = mounted;
  mounted = undefined;
  if (done === undefined) return;
  act(() => done.root.unmount());
  done.element.remove();
});

const anthropic =
  "version: 1\nid: anthropic\nname: Anthropic\ntype: anthropic\nsecret: ANTHROPIC_API_KEY\n";
const gateway = "version: 1\nid: gateway\nname: Gateway\ntype: openai\nsecret: ANTHROPIC_API_KEY\n";
const ollama = "version: 1\nid: ollama\nname: Ollama\ntype: ollama\nlocal: true\n";

function filesWith(providers: Record<string, string>): ModelsFiles {
  return {
    readModels: async () => null,
    readProviders: async () =>
      Object.entries(providers)
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([id, text]) => ({ path: `providers/${id}.yaml`, text })),
    readProvider: async () => null,
    changeProvider: () => undefined,
    readWorkspace: async () => null,
    changeModels: () => undefined,
    changeWorkspace: () => undefined,
    subscribe: () => () => undefined,
  };
}

/** A key store that knows only the names in `stored`. */
function keysWith(stored: readonly string[]): ModelKeys {
  return {
    entry: { kind: "field", keptOn: "this-computer", offHostHttps: false },
    stored: async (name) => stored.includes(name),
    save: async () => undefined,
    remove: async () => undefined,
  };
}

/** The workspace page the feature adds its sections to; the workspace feature adds it in the app. */
const workspacePage = defineFeature({
  id: "workspace-stub",
  title: "Workspace",
  register: (studio) =>
    studio.itemKinds.add({
      kind: "workspace",
      label: "Workspace",
      icon: "settings",
      open: { view: "Stub", load: async () => ({ Stub: () => null }) },
      tab: { describe: () => ({ label: "Workspace" }), exists: () => true },
    }),
});

/** What the window was asked to open, in order. */
type Opened =
  | { readonly item: ItemRef; readonly options: OpenItemOptions | undefined }
  | { readonly command: string };

/**
 * The models feature in a shell for one open folder, as the app builds it, with the services
 * another feature's view would get and what the window was asked to open.
 */
function folderWith(files: ModelsFiles, keys?: ModelKeys) {
  const shell = createShell({
    features: [workspacePage, modelsFeature],
    // The key store is a host service the app may leave out, as the browser demo does.
    hostServices:
      keys === undefined ? [ModelsFilesService] : [ModelsFilesService, ModelKeysService],
  });
  const services = new Map<string, unknown>();
  const workspace = {
    provide: (key: { name: string }, service: unknown) => services.set(key.name, service),
    get: (key: { name: string }) => services.get(key.name),
    has: (key: { name: string }) => services.has(key.name),
  };
  workspace.provide(ModelsFilesService, files);
  if (keys !== undefined) workspace.provide(ModelKeysService, keys);
  shell.services.instantiate(workspace as never);
  const opened: Opened[] = [];
  const context = {
    ...shell.services.contextFor("models", workspace as never),
    openItem: (item: ItemRef, options?: OpenItemOptions) => opened.push({ item, options }),
    runCommand: (command: string) => {
      opened.push({ command });
      return true;
    },
  };
  /** Draws the window's page opener, as each window does once. */
  const drawWindow = async () => {
    const element = document.createElement("div");
    document.body.append(element);
    const root = createRoot(element);
    mounted = { root, element };
    await act(async () => root.render(<PageOpenerHost context={context} />));
  };
  return { services: context.services, opened, drawWindow };
}

/** Lets the providers be read and the window open what was asked for. */
async function settle() {
  await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
}

const anthropicPage: ItemRef = { kind: "model-provider", hub: "local", id: "anthropic" };

verifies("models.api-keys.open-by-secret", () => {
  describe("ModelsService.openProviderPage", () => {
    it("opens the provider with that secret name at its key block", async () => {
      const { services, opened, drawWindow } = folderWith(filesWith({ anthropic, ollama }));
      await drawWindow();

      services.get(ModelsService).openProviderPage("ANTHROPIC_API_KEY", "key");
      await settle();

      expect(opened).toEqual([{ item: anthropicPage, options: { step: "key" } }]);
    });

    it("opens at the key block when no target is given", async () => {
      const { services, opened, drawWindow } = folderWith(filesWith({ anthropic }));
      await drawWindow();

      services.get(ModelsService).openProviderPage("ANTHROPIC_API_KEY");
      await settle();

      expect(opened).toEqual([{ item: anthropicPage, options: { step: "key" } }]);
    });

    it("opens the page at the top for the target page", async () => {
      const { services, opened, drawWindow } = folderWith(filesWith({ anthropic }));
      await drawWindow();

      services.get(ModelsService).openProviderPage("ANTHROPIC_API_KEY", "page");
      await settle();

      expect(opened).toEqual([{ item: anthropicPage, options: undefined }]);
    });

    it("opens the first provider by file name when two share the secret name", async () => {
      const { services, opened, drawWindow } = folderWith(filesWith({ gateway, anthropic }));
      await drawWindow();

      services.get(ModelsService).openProviderPage("ANTHROPIC_API_KEY", "key");
      await settle();

      expect(opened).toEqual([{ item: anthropicPage, options: { step: "key" } }]);
    });

    it("opens the workspace page's Models when no provider has that secret name", async () => {
      const { services, opened, drawWindow } = folderWith(filesWith({ ollama }));
      await drawWindow();

      services.get(ModelsService).openProviderPage("OPENAI_API_KEY", "key");
      await settle();

      expect(opened).toEqual([{ command: "workspace.open-models" }]);
    });

    it("opens a page asked for before the window drew its opener, once", async () => {
      const { services, opened, drawWindow } = folderWith(filesWith({ anthropic }));

      services.get(ModelsService).openProviderPage("ANTHROPIC_API_KEY", "key");
      await settle();
      await drawWindow();
      await settle();

      expect(opened).toEqual([{ item: anthropicPage, options: { step: "key" } }]);
    });
  });
});

describe("ModelsService", () => {
  it("says whether a key is stored under the name", async () => {
    const { services } = folderWith(filesWith({}), keysWith(["ANTHROPIC_API_KEY"]));
    const models = services.get(ModelsService);

    expect(await models.keyStored("ANTHROPIC_API_KEY")).toBe(true);
    expect(await models.keyStored("OPENAI_API_KEY")).toBe(false);
  });

  it("says no key is stored where the app keeps no keys", async () => {
    const { services } = folderWith(filesWith({}));

    expect(await services.get(ModelsService).keyStored("ANTHROPIC_API_KEY")).toBe(false);
  });

  it("opens the alias tab", async () => {
    const { services, opened, drawWindow } = folderWith(filesWith({}));
    await drawWindow();

    services.get(ModelsService).openAlias("fast");
    await settle();

    expect(opened).toEqual([
      { item: { kind: "model-alias", hub: "local", id: "fast" }, options: undefined },
    ]);
  });
});
