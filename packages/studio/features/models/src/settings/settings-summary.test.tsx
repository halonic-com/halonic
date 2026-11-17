// @vitest-environment jsdom

import {
  limitedLookup,
  type SettingsSectionProps,
  type WorkspaceContext,
} from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { type ModelsFiles, ModelsFilesService } from "../api.ts";
import { modelsFeature } from "../feature.ts";
import { ModelsSettingsSection } from "./models-settings-section.tsx";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
let element: HTMLElement | undefined;

afterEach(() => {
  act(() => root?.unmount());
  element?.remove();
});

const aliases = (n: number) =>
  n === 0
    ? "version: 1\naliases: {}\n"
    : `version: 1\naliases:\n${Array.from({ length: n }, (_, i) => `  a${i}: { provider: p, model: m }\n`).join("")}`;
const provider = (id: string) => `version: 1\nid: ${id}\ntype: anthropic\nsecret: k-${id}\n`;

function filesWith(options: {
  aliases: number | "unreadable";
  providers: string[] | "unreadable";
  workspace?: string;
}) {
  const files: ModelsFiles = {
    readModels: async () =>
      options.aliases === "unreadable" ? "version: 1\naliases: [\n" : aliases(options.aliases),
    readProviders: async () =>
      options.providers === "unreadable"
        ? Promise.reject(new Error("no folder"))
        : options.providers.map((id) => ({ path: `providers/${id}.yaml`, text: provider(id) })),
    readProvider: async () => null,
    readWorkspace: async () => options.workspace ?? "version: 1\nid: acme\nname: Acme\n",
    changeModels: () => undefined,
    changeProvider: () => undefined,
    changeWorkspace: () => undefined,
    subscribe: () => () => undefined,
  };
  return files;
}

function contextOf(files: ModelsFiles, runCommand = vi.fn(() => true)) {
  const services = limitedLookup(modelsFeature, {
    get: (key) => (key === ModelsFilesService ? files : undefined),
    find: () => undefined,
  });
  return { context: { services, runCommand } as unknown as WorkspaceContext, runCommand };
}

/** The line the container draws under the name: the section's registered `description`. */
async function lineOf(files: ModelsFiles) {
  const section = registered();
  const { context } = contextOf(files);
  return typeof section?.description === "function"
    ? await section.description(context, "app")
    : undefined;
}

type Added = {
  id: string;
  scope: string;
  summary?: (c: WorkspaceContext) => unknown;
  description?: (c: WorkspaceContext, place: "app" | "served") => unknown;
};

function registered() {
  const added: Added[] = [];
  // Every other contribution point accepts a call and ignores it.
  const ignore: unknown = new Proxy(() => undefined, { get: () => ignore });
  const studio = new Proxy(
    { settings: { add: (section: Added) => added.push(section) } },
    { get: (target, key) => (key in target ? target[key as "settings"] : ignore) },
  );
  modelsFeature.register(studio as never);
  return added.find(({ id }) => id === "models");
}

async function show(files: ModelsFiles) {
  const { context, runCommand } = contextOf(files);
  const closeSettings = vi.fn();
  element = document.createElement("div");
  document.body.append(element);
  root = createRoot(element);
  const props: SettingsSectionProps = { context, closeSettings, place: "app", surface: "window" };
  await act(async () => root?.render(<ModelsSettingsSection {...props} />));
  return { view: element, closeSettings, runCommand };
}

verifies("models.settings.settings-summary", () => {
  it("says the aliases, providers and the monthly budget", async () => {
    const line = await lineOf(
      filesWith({
        aliases: 3,
        providers: ["a", "b"],
        workspace: "version: 1\nid: acme\nname: Acme\nbudget: { currency: EUR, monthly: 50 }\n",
      }),
    );
    expect(line).toBe("3 aliases · 2 providers · budget €50.00 a month");
  });

  it("uses the singular and leaves out a budget that isn't set", async () => {
    const line = await lineOf(filesWith({ aliases: 1, providers: ["a"] }));
    expect(line).toBe("1 alias · 1 provider");
  });

  it("says no providers yet when there are none", async () => {
    const line = await lineOf(filesWith({ aliases: 2, providers: [] }));
    expect(line).toBe("No providers yet");
  });

  it("leaves the aliases out while models.yaml can't be read", async () => {
    const line = await lineOf(
      filesWith({
        aliases: "unreadable",
        providers: ["a", "b"],
        workspace: "version: 1\nid: acme\nname: Acme\nbudget: { currency: USD, monthly: 50 }\n",
      }),
    );
    expect(line).toBe("2 providers · budget $50.00 a month");
  });

  it("leaves the providers out, not 'no providers yet', while the providers folder can't be read", async () => {
    const line = await lineOf(filesWith({ aliases: 2, providers: "unreadable" }));
    expect(line).toBe("2 aliases");
  });

  it("closes Settings, then opens Models", async () => {
    const { view, closeSettings, runCommand } = await show(
      filesWith({ aliases: 1, providers: ["a"] }),
    );
    const button = view.querySelector("button");
    expect(button?.textContent).toBe("Open Models");
    await act(async () => button?.click());
    expect(closeSettings).toHaveBeenCalledBefore(runCommand);
    expect(runCommand).toHaveBeenCalledWith("workspace.open-models");
  });

  it("registers the section as `models` in the workspace group, with the same line as summary", async () => {
    const section = registered();
    expect(section?.scope).toBe("workspace");
    const { context } = contextOf(filesWith({ aliases: 1, providers: ["a"] }));
    expect(await section?.summary?.(context)).toBe("1 alias · 1 provider");
    expect(await section?.description?.(context, "app")).toBe("1 alias · 1 provider");
  });
});
