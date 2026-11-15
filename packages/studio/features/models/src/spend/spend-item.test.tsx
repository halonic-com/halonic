// @vitest-environment jsdom

import { type RunsList, RunsListService } from "@halonicjs/studio-feature-runs/api";
import { createShell, defineFeature, type WorkspaceContext } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type ModelsFiles, ModelsFilesService } from "../api.ts";
import { modelsFeature } from "../feature.ts";
import { SpendItem } from "./spend-item.tsx";
import { monthLine, SPEND_TOOLTIP } from "./spend-text.ts";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
let element: HTMLElement | undefined;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-15T12:00:00.000Z"));
});

afterEach(() => {
  act(() => root?.unmount());
  element?.remove();
  vi.useRealTimers();
});

const header = "version: 1\nid: acme\nname: Acme\n";
const cloud = "version: 1\nid: anthropic\ntype: anthropic\nsecret: anthropic-key\n";
const local = "version: 1\nid: ollama\ntype: ollama\n";

function filesOf(workspace: string, provider: string): ModelsFiles {
  return {
    readModels: async () => "version: 1\naliases: {}\n",
    readProviders: async () => [{ path: "providers/p.yaml", text: provider }],
    readProvider: async () => null,
    readWorkspace: async () => workspace,
    changeModels: () => undefined,
    changeProvider: () => undefined,
    changeWorkspace: () => undefined,
    subscribe: () => () => undefined,
  };
}

/** The shared run list of `[startedAt, cost]`; `unread` leaves it not loaded yet. */
function runsOf(runs: readonly [string, number][], unread = false): RunsList {
  const state = {
    loaded: !unread,
    runs: runs.map(([startedAt, cost]) => ({ summary: { startedAt, cost }, madeToolCalls: false })),
  };
  return { state, subscribe: () => () => undefined } as unknown as RunsList;
}

async function show(files: ModelsFiles, runs: RunsList, runCommand?: (id: string) => boolean) {
  const services = {
    get: () => files,
    find: (key: unknown) => (key === RunsListService ? runs : files),
  };
  const context = { services, runCommand } as unknown as WorkspaceContext;
  element = document.createElement("div");
  document.body.append(element);
  root = createRoot(element);
  await act(async () => root?.render(<SpendItem context={context} />));
  return element;
}

/** What the item says on the bar, without the tooltip text. */
const lineOf = (item: HTMLElement) => item.querySelector("button span")?.textContent ?? "";

verifies("models.spend.month-line", () => {
  describe("the words", () => {
    it("says the month with and without a monthly budget", () => {
      expect(monthLine(3.2, undefined, "EUR").text).toBe("Est. €3.20 this month");
      expect(monthLine(3.2, 50, "EUR").text).toBe("Est. €3.20 of €50.00 this month");
    });

    it("says used up once the budget is reached", () => {
      expect(monthLine(50.02, 50, "EUR")).toEqual({
        text: "Est. €50.02 of €50.00 this month · used up",
        usedUp: true,
      });
      expect(monthLine(50, 50, "EUR").usedUp).toBe(true);
    });
  });

  describe("the item", () => {
    it("shows this month's cost and leaves out a run of the month before", async () => {
      const item = await show(
        filesOf(`${header}budget: { monthly: 50 }\n`, cloud),
        runsOf([
          ["2026-11-02T08:00:00.000Z", 3],
          ["2026-11-10T08:00:00.000Z", 0.2],
          ["2026-10-31T23:59:00.000Z", 40],
        ]),
      );
      expect(lineOf(item)).toBe("Est. €3.20 of €50.00 this month");
    });

    it("says used up when the month has spent the budget", async () => {
      const item = await show(
        filesOf(`${header}budget: { monthly: 50 }\n`, cloud),
        runsOf([["2026-11-02T08:00:00.000Z", 50.02]]),
      );
      expect(lineOf(item)).toBe("Est. €50.02 of €50.00 this month · used up");
    });

    it("says the month without a budget", async () => {
      const item = await show(filesOf(header, cloud), runsOf([["2026-11-02T08:00:00.000Z", 3.2]]));
      expect(lineOf(item)).toBe("Est. €3.20 this month");
    });

    it("shows nothing when only local providers are used", async () => {
      const item = await show(filesOf(header, local), runsOf([["2026-11-02T08:00:00.000Z", 3.2]]));
      expect(lineOf(item)).toBe("");
    });

    it("shows nothing when the workspace allows local providers only", async () => {
      const item = await show(
        filesOf(`${header}privacy: { localOnly: true }\n`, cloud),
        runsOf([["2026-11-02T08:00:00.000Z", 3.2]]),
      );
      expect(lineOf(item)).toBe("");
    });

    it("shows nothing until the run list has been read", async () => {
      const item = await show(filesOf(header, cloud), runsOf([], true));
      expect(lineOf(item)).toBe("");
    });

    it("reads the shared run list through the shell's lookup, which models lists in wants", async () => {
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
      const runs = defineFeature({
        id: "runs",
        title: "Runs",
        provides: [RunsListService],
        register: (studio) =>
          studio.services.provide(RunsListService, () =>
            runsOf([["2026-11-02T08:00:00.000Z", 3.2]]),
          ),
      });
      const shell = createShell({
        features: [workspacePage, runs, modelsFeature],
        hostServices: [ModelsFilesService],
      });
      const services = new Map<string, unknown>();
      const workspace = {
        provide: (key: { name: string }, service: unknown) => services.set(key.name, service),
        get: (key: { name: string }) => services.get(key.name),
        has: (key: { name: string }) => services.has(key.name),
      };
      workspace.provide(ModelsFilesService, filesOf(`${header}budget: { monthly: 50 }\n`, cloud));
      shell.services.instantiate(workspace as never);
      const context = shell.services.contextFor("models", workspace as never);
      element = document.createElement("div");
      document.body.append(element);
      root = createRoot(element);
      await act(async () => root?.render(<SpendItem context={context} />));
      await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
      expect(lineOf(element)).toBe("Est. €3.20 of €50.00 this month");
    });

    it("opens the workspace page when pressed", async () => {
      const runCommand = vi.fn(() => true);
      const item = await show(filesOf(header, cloud), runsOf([]), runCommand);
      await act(async () => item.querySelector("button")?.click());
      expect(runCommand).toHaveBeenCalledWith("workspace.open-models");
    });

    it("keeps the estimate wording in its tooltip text", () => {
      expect(SPEND_TOOLTIP).toContain("Not a provider invoice");
    });
  });
});
