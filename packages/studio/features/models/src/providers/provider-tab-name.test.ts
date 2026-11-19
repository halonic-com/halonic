import type { ItemKindContribution, WorkspaceContext } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it, vi } from "vitest";
import type { ModelsFiles } from "../api.ts";
import { modelsFeature } from "../feature.ts";
import { PROVIDER_KIND } from "./provider-text.ts";

/** The provider kind's tab behaviour, as the feature registers it. */
function providerTab() {
  const kinds: ItemKindContribution[] = [];
  const studio = {
    settings: { add: () => undefined },
    statusBar: { add: () => undefined },
    itemPage: { addSection: () => undefined },
    itemKinds: { add: (kind: ItemKindContribution) => kinds.push(kind) },
  };
  modelsFeature.register(studio as never);
  const tab = kinds.find((kind) => kind.kind === PROVIDER_KIND)?.tab;
  if (tab?.subscribe === undefined) throw new Error("the provider kind has no tab subscribe");
  return { ...tab, subscribe: tab.subscribe };
}

/** `providers/` holding `files` by id, which `change` replaces and tells subscribers about. */
function providersFolder(initial: Record<string, string>) {
  let providers = initial;
  const listeners = new Set<() => void>();
  const reads = vi.fn(async () =>
    Object.entries(providers).map(([id, text]) => ({ path: `providers/${id}.yaml`, text })),
  );
  const files = {
    readProviders: reads,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  } as unknown as ModelsFiles;
  const context = { services: { find: () => files } } as unknown as WorkspaceContext;
  const change = (next: Record<string, string>) => {
    providers = next;
    for (const listener of listeners) listener();
  };
  return { context, change, reads };
}

/** Lets every read that has started finish. */
const settled = () => new Promise((resolve) => setTimeout(resolve, 0));

const lmStudio = (name: string) => `version: 1\nid: lm-studio\nname: ${name}\ntype: lmstudio\n`;
const anthropic = "version: 1\nid: anthropic\ntype: anthropic\nsecret: anthropic\n";
const item = (id: string) => ({ kind: PROVIDER_KIND, hub: "local", id });

verifies("models.providers.tab-name", () => {
  it("names the tab of lm-studio after its name, LM Studio, once providers/ is read (C104 P3)", async () => {
    const tab = providerTab();
    const { context } = providersFolder({ "lm-studio": lmStudio("LM Studio") });
    const listener = vi.fn();
    expect(tab.describe(item("lm-studio"), context).label).toBe("Lm-studio");

    const stop = tab.subscribe(listener, context);
    await vi.waitFor(() => expect(listener).toHaveBeenCalledOnce());
    stop();

    expect(tab.describe(item("lm-studio"), context).label).toBe("LM Studio");
  });

  it("names the tab of a provider with no name after its id with a capital", async () => {
    const tab = providerTab();
    const { context } = providersFolder({ anthropic, "lm-studio": lmStudio("LM Studio") });
    const listener = vi.fn();

    const stop = tab.subscribe(listener, context);
    await vi.waitFor(() => expect(listener).toHaveBeenCalledOnce());
    stop();

    expect(tab.describe(item("anthropic"), context).label).toBe("Anthropic");
  });

  it("tells the window when a provider is renamed, so its tab takes the new name", async () => {
    const tab = providerTab();
    const { context, change } = providersFolder({ "lm-studio": lmStudio("LM Studio") });
    const listener = vi.fn();
    const stop = tab.subscribe(listener, context);
    await vi.waitFor(() => expect(listener).toHaveBeenCalledOnce());

    change({ "lm-studio": lmStudio("LM Studio (laptop)") });
    await vi.waitFor(() => expect(listener).toHaveBeenCalledTimes(2));
    stop();

    expect(tab.describe(item("lm-studio"), context).label).toBe("LM Studio (laptop)");
  });

  it("stays quiet when providers/ changes but no name does", async () => {
    const tab = providerTab();
    const { context, change, reads } = providersFolder({ "lm-studio": lmStudio("LM Studio") });
    const listener = vi.fn();
    const stop = tab.subscribe(listener, context);
    await vi.waitFor(() => expect(listener).toHaveBeenCalledOnce());

    change({ "lm-studio": `${lmStudio("LM Studio")}local: true\n` });
    await vi.waitFor(() => expect(reads).toHaveBeenCalledTimes(2));
    await settled();
    stop();

    expect(listener).toHaveBeenCalledOnce();
  });

  it("stops reading providers/ once the window stops listening", async () => {
    const tab = providerTab();
    const { context, change, reads } = providersFolder({ "lm-studio": lmStudio("LM Studio") });
    const listener = vi.fn();
    const stop = tab.subscribe(listener, context);
    await vi.waitFor(() => expect(listener).toHaveBeenCalledOnce());

    stop();
    change({ "lm-studio": lmStudio("Renamed") });
    await settled();

    expect(reads).toHaveBeenCalledOnce();
    expect(tab.describe(item("lm-studio"), context).label).toBe("LM Studio");
  });
});
