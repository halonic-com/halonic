// @vitest-environment jsdom

import type { RunsList } from "@halonicjs/studio-feature-runs/api";
import { RunsListService } from "@halonicjs/studio-feature-runs/api";
import type { WorkspaceContext } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it } from "vitest";
import { type ModelKeys, ModelKeysService, type ModelsFiles, ModelsFilesService } from "../api.ts";
import { modelsFeature } from "../feature.ts";
import { ModelsSettingsSection } from "./models-settings-section.tsx";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
let element: HTMLElement | undefined;

afterEach(() => {
  act(() => root?.unmount());
  element?.remove();
});

interface Setup {
  /** Provider names by id; each names the secret `k-<id>`. */
  readonly providers: Readonly<Record<string, string>>;
  /** The ids whose key is stored. */
  readonly keys?: readonly string[];
  readonly keysFail?: boolean;
  readonly monthly?: number;
  readonly spent?: number;
  readonly localOnly?: boolean;
}

function contextOf(setup: Setup): WorkspaceContext {
  const files: ModelsFiles = {
    readModels: async () => "version: 1\naliases: {}\n",
    readProviders: async () =>
      Object.entries(setup.providers).map(([id, name]) => ({
        path: `providers/${id}.yaml`,
        text: `version: 1\nid: ${id}\nname: ${name}\ntype: anthropic\nsecret: k-${id}\n`,
      })),
    readProvider: async () => null,
    readWorkspace: async () =>
      `version: 1\nid: acme\nname: Acme\nprivacy: { localOnly: ${setup.localOnly === true} }\n${
        setup.monthly === undefined ? "" : `budget: { currency: EUR, monthly: ${setup.monthly} }\n`
      }`,
    changeModels: () => undefined,
    changeProvider: () => undefined,
    changeWorkspace: () => undefined,
    subscribe: () => () => undefined,
  };
  const keys = {
    stored: async (secret: string) => {
      if (setup.keysFail === true) throw new Error("no keychain");
      return (setup.keys ?? []).some((id) => `k-${id}` === secret);
    },
  } as unknown as ModelKeys;
  const runs = {
    state: {
      loaded: true,
      runs:
        setup.spent === undefined
          ? []
          : [
              {
                summary: {
                  startedAt: new Date().toISOString(),
                  cost: setup.spent,
                  unpricedCalls: 0,
                  hubId: "acme",
                  parentRunId: null,
                },
              },
            ],
    },
    subscribe: () => () => undefined,
  } as unknown as RunsList;
  const table = new Map<unknown, unknown>([
    [ModelsFilesService, files],
    [ModelKeysService, keys],
    [RunsListService, runs],
  ]);
  return {
    services: { get: (key: unknown) => table.get(key), find: (key: unknown) => table.get(key) },
    runCommand: () => true,
  } as unknown as WorkspaceContext;
}

async function chipsOf(setup: Setup): Promise<string[]> {
  element = document.createElement("div");
  document.body.append(element);
  root = createRoot(element);
  await act(async () =>
    root?.render(
      <ModelsSettingsSection
        context={contextOf(setup)}
        closeSettings={() => undefined}
        place="app"
        surface="window"
      />,
    ),
  );
  return [...element.querySelectorAll("li")].map((chip) => chip.textContent ?? "");
}

async function attention(setup: Setup): Promise<boolean> {
  let found: boolean | undefined;
  const registered: { id: string; attention?: (c: WorkspaceContext) => unknown }[] = [];
  const ignore: unknown = new Proxy(() => undefined, { get: () => ignore });
  const studio = new Proxy(
    { settings: { add: (section: (typeof registered)[number]) => registered.push(section) } },
    { get: (target, key) => (key in target ? target[key as "settings"] : ignore) },
  );
  modelsFeature.register(studio as never);
  found = (await registered.find(({ id }) => id === "models")?.attention?.(contextOf(setup))) as
    | boolean
    | undefined;
  return found === true;
}

verifies("models.settings.problems", () => {
  it("shows Budget used up when this month's cost has reached the monthly budget", async () => {
    const setup = { providers: { a: "Anthropic" }, keys: ["a"], monthly: 50, spent: 50 };
    expect(await chipsOf(setup)).toEqual(["Budget used up"]);
    expect(await attention(setup)).toBe(true);
  });

  it("shows no chip while the budget isn't reached, and no mark", async () => {
    const setup = { providers: { a: "Anthropic" }, keys: ["a"], monthly: 50, spent: 49.99 };
    expect(await chipsOf(setup)).toEqual([]);
    expect(await attention(setup)).toBe(false);
  });

  it("names each provider that has no key, after Budget used up", async () => {
    const setup = {
      providers: { a: "Anthropic", b: "OpenAI", c: "Mistral" },
      keys: ["c"],
      monthly: 5,
      spent: 6,
    };
    expect(await chipsOf(setup)).toEqual([
      "Budget used up",
      "No key for Anthropic",
      "No key for OpenAI",
    ]);
  });

  it("shows no chip for a key it couldn't check, or when only local providers may be used", async () => {
    expect(await chipsOf({ providers: { a: "Anthropic" }, keysFail: true })).toEqual([]);
    expect(await chipsOf({ providers: { a: "Anthropic" }, localOnly: true })).toEqual([]);
    expect(await attention({ providers: { a: "Anthropic" }, keysFail: true })).toBe(false);
  });

  it("marks the list's row when a key is missing", async () => {
    expect(await attention({ providers: { a: "Anthropic" } })).toBe(true);
  });
});
