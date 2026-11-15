// @vitest-environment jsdom

import {
  type RunsList,
  RunsListService,
  type SourcedRun,
} from "@halonicjs/studio-feature-runs/api";
import {
  createShell,
  defineFeature,
  type ItemRef,
  type WorkspaceContext,
} from "@halonicjs/studio-shell";
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
function runsOf(
  runs: readonly [string, number, Partial<SourcedRun["summary"]>?][],
  unread = false,
): RunsList {
  const state = {
    loaded: !unread,
    runs: runs.map(([startedAt, cost, more]) => ({
      summary: { startedAt, cost, unpricedCalls: 0, hubId: "acme", parentRunId: null, ...more },
      madeToolCalls: false,
    })),
  };
  return { state, subscribe: () => () => undefined } as unknown as RunsList;
}

async function show(
  files: ModelsFiles,
  runs: RunsList,
  runCommand?: (id: string) => boolean,
  inView?: ItemRef | null,
) {
  const services = {
    get: () => files,
    find: (key: unknown) => (key === RunsListService ? runs : files),
  };
  const activeItem = { get: () => inView ?? null, subscribe: () => () => undefined };
  const context = { services, runCommand, activeItem } as unknown as WorkspaceContext;
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

    describe("with a run in view", () => {
      const budget = `${header}budget: { monthly: 50, perRun: 5 }\n`;
      const view = (id: string): ItemRef => ({ kind: "run", hub: "acme", id });
      const month = (
        extra: Partial<SourcedRun["summary"]>,
      ): [string, number, Partial<SourcedRun["summary"]>] => [
        "2026-11-05T08:00:00.000Z",
        0.15,
        { id: "r1", ...extra },
      ];

      it("puts the run first, with its per-run budget", async () => {
        const item = await show(
          filesOf(budget, cloud),
          runsOf([["2026-11-02T08:00:00.000Z", 3.2], month({})]),
          undefined,
          view("r1"),
        );
        expect(lineOf(item)).toBe("Est. this run €0.15 of €5.00 · €3.35 of €50.00 this month");
      });

      it("leaves out the per-run budget when there is none", async () => {
        const item = await show(
          filesOf(`${header}budget: { monthly: 50 }\n`, cloud),
          runsOf([["2026-11-02T08:00:00.000Z", 3.2], month({})]),
          undefined,
          view("r1"),
        );
        expect(lineOf(item)).toBe("Est. this run €0.15 · €3.35 of €50.00 this month");
      });

      it("names the calls without a price", async () => {
        const item = await show(
          filesOf(header, cloud),
          runsOf([month({ cost: 0.1, unpricedCalls: 2 })]),
          undefined,
          view("r1"),
        );
        expect(lineOf(item)).toBe(
          "Est. this run €0.10 + 2 calls without a price · €0.10 this month",
        );
      });

      it("names no amount for a run whose calls all lack a price", () => {
        const only = monthLine(1, undefined, "EUR", {
          spend: { cost: 0, unpricedCalls: 1 },
          perRun: 5,
        });
        expect(only.text).toBe("Est. this run 1 call without a price · €1.00 this month");
      });

      it("counts the run's sub-runs in its cost", async () => {
        const item = await show(
          filesOf(budget, cloud),
          runsOf([
            month({}),
            ["2026-11-05T08:01:00.000Z", 0.2, { id: "r2", parentRunId: "r1" }],
            ["2026-11-05T08:02:00.000Z", 0.1, { id: "r3", parentRunId: "r2" }],
          ]),
          undefined,
          view("r1"),
        );
        expect(lineOf(item)).toBe("Est. this run €0.45 of €5.00 · €0.45 of €50.00 this month");
      });

      it("names a sub-run's calls without a price, never €0.00", async () => {
        const item = await show(
          filesOf(header, cloud),
          runsOf([
            month({ cost: 0 }),
            ["2026-11-05T08:01:00.000Z", 0, { id: "r2", parentRunId: "r1", unpricedCalls: 2 }],
          ]),
          undefined,
          view("r1"),
        );
        expect(lineOf(item)).toBe("Est. this run 2 calls without a price · €0.00 this month");
      });

      it("says the month only when the tab shows no run or one the list lacks", async () => {
        const files = filesOf(header, cloud);
        const runs = runsOf([month({})]);
        for (const inView of [
          null,
          view("other"),
          { kind: "run", hub: "other-hub", id: "r1" },
          { kind: "workflow", hub: "acme", id: "r1" },
        ]) {
          const item = await show(files, runs, undefined, inView);
          expect(lineOf(item)).toBe("Est. €0.15 this month");
          act(() => root?.unmount());
          element?.remove();
        }
      });
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
