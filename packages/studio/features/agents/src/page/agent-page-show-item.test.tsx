// @vitest-environment jsdom

import {
  createShell,
  defineFeature,
  type ServiceKey,
  StudioWindow,
  StudioWorkspace,
  type WorkspaceContext,
} from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AgentsHostService } from "../api.ts";
import { agentsFeature } from "../feature.ts";
import { memoryAgentsHost } from "../memory-host.ts";
import { buttonNamed, openDialogsInJsdom, show, unmount } from "../test-support.tsx";

const original = { matchMedia: window.matchMedia };

beforeEach(() => {
  openDialogsInJsdom();
  // A wide window: the desktop's tabs, where `showItem` is.
  window.matchMedia = ((query: string) =>
    ({
      media: query,
      matches: false,
      addEventListener: () => {},
      removeEventListener: () => {},
    }) as unknown as MediaQueryList) as typeof window.matchMedia;
});

afterEach(() => {
  unmount();
  window.matchMedia = original.matchMedia;
});

const agent = (id: string, name: string, subagents: string[] = []) => ({
  hubId: "acme",
  id,
  name,
  subagents,
});

/**
 * The real Agents feature in a desktop window, over a hub where Mail triage hands work to Writer
 * and Writer to Fact checker, and Sorter works alone; and a dialog host that keeps its context, as
 * the Build chat's would.
 */
async function renderWindow() {
  const host = memoryAgentsHost({
    hubs: [{ id: "acme", name: "Acme Mail" }],
    agents: [
      agent("triage", "Mail triage", ["writer"]),
      agent("writer", "Writer", ["checker"]),
      agent("checker", "Fact checker"),
      agent("sorter", "Sorter"),
    ],
  });
  const contexts: WorkspaceContext[] = [];
  const appFeature = defineFeature({
    id: "app",
    title: "App",
    provides: [AgentsHostService],
    register(studio) {
      studio.services.provide(AgentsHostService, () => host);
      studio.dialogs.add({
        id: "app.chat",
        order: 10,
        view: "Chat",
        load: async () => ({
          Chat: ({ context }: { context: WorkspaceContext }) => {
            contexts.push(context);
            return null;
          },
        }),
      });
    },
  });
  const shell = createShell({ features: [appFeature, agentsFeature] });
  const provided = new Map<string, unknown>();
  const services = {
    provide<Service>(key: ServiceKey<Service>, service: Service): Service {
      provided.set(key.name, service);
      return service;
    },
    get<Service>(key: ServiceKey<Service>): Service {
      return provided.get(key.name) as Service;
    },
    has: (key: ServiceKey<unknown>) => provided.has(key.name),
  };
  shell.services.instantiate(services);
  const workspace = new StudioWorkspace({ toasts: shell.toasts, services });
  const page = await show(
    <StudioWindow
      shell={shell}
      workspace={workspace}
      host="desktop-app"
      platform="windows"
      language="en"
    />,
  );
  await act(async () =>
    workspace.tabs.openHere({ key: "agent/acme/triage", title: "Mail triage" }),
  );
  await settle();
  const context = contexts.at(-1);
  if (context === undefined) throw new Error("The dialog host wasn't drawn.");
  return { page, context, tabs: workspace.tabs };
}

/** Lets the lazily loaded page and its reads arrive. */
async function settle() {
  for (let round = 0; round < 3; round += 1) {
    await act(async () => {
      await vi.dynamicImportSettled();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

/** The title of the top card on the shown page, or `undefined` while its panel shows the view. */
const topCardTitle = (page: HTMLElement) =>
  page.querySelector("[data-tab-page]:not([hidden]) [data-top-card-title]")?.textContent;

verifies("agents.page.cards", () => {
  it("opens an agent of its team that the window shows as a subagent's card, with no new tab", async () => {
    const { page, context, tabs } = await renderWindow();

    let shown: unknown;
    await act(async () => {
      shown = context.showItem?.({ kind: "agent", hub: "acme", id: "checker" });
    });
    await settle();

    expect(shown).toEqual({ placed: "card", name: "Fact checker" });
    expect(tabs.state.tabs).toHaveLength(1);
    expect(topCardTitle(page)).toBe("Fact checker");
  });

  it("opens an agent outside its team in its own tab", async () => {
    const { page, context, tabs } = await renderWindow();

    let shown: unknown;
    await act(async () => {
      shown = context.showItem?.({ kind: "agent", hub: "acme", id: "sorter" });
    });
    await settle();

    expect(shown).toEqual({ placed: "tab", name: "Sorter" });
    expect(tabs.state.tabs).toHaveLength(2);
    expect(tabs.state.activeId).toBe(tabs.state.tabs[1]?.id);
    expect(topCardTitle(page)).toBeUndefined();
  });

  it("opens a team member in its own tab while the page shows Runs, which has no cards", async () => {
    const { page, context, tabs } = await renderWindow();
    const runs = buttonNamed(
      page.querySelector("[data-tab-page]:not([hidden])") as HTMLElement,
      "Runs",
    );
    await act(async () => runs?.click());
    await settle();

    let shown: unknown;
    await act(async () => {
      shown = context.showItem?.({ kind: "agent", hub: "acme", id: "writer" });
    });
    await settle();

    expect(shown).toEqual({ placed: "tab", name: "Writer" });
    expect(tabs.state.tabs).toHaveLength(2);
  });
});
