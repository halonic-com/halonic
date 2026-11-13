// @vitest-environment jsdom

import {
  createShell,
  defineFeature,
  type ServiceKey,
  StudioWindow,
  StudioWorkspace,
} from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it } from "vitest";
import { RunsSourceService } from "../api.ts";
import { runsFeature } from "../feature.ts";
import { fakeSource } from "../source.test-helper.ts";
import { summaryWith } from "../summary.test-helper.ts";
import { render, unmountAll } from "../test-support/render.tsx";

const original = { matchMedia: window.matchMedia };

beforeEach(() => {
  window.matchMedia = ((query: string) =>
    ({
      media: query,
      matches: false,
      addEventListener: () => {},
      removeEventListener: () => {},
    }) as unknown as MediaQueryList) as typeof window.matchMedia;
});

afterEach(() => {
  unmountAll();
  window.matchMedia = original.matchMedia;
});

const run = summaryWith({ id: "run_a_7k2m9p" });

/** A workspace with the real Runs feature, one run in it (or a list that never answers), and the app's source behind it. */
function renderWindow(neverLoads = false) {
  const { source: loaded } = fakeSource([run]);
  const source = neverLoads ? { ...loaded, list: () => new Promise<never>(() => {}) } : loaded;
  const sourceFeature = defineFeature({
    id: "runs-source",
    title: "Runs source",
    provides: [RunsSourceService],
    register(studio) {
      studio.services.provide(RunsSourceService, () => source);
    },
  });
  const shell = createShell({ features: [sourceFeature, runsFeature] });
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
  const container = render(
    <StudioWindow
      shell={shell}
      workspace={workspace}
      host="desktop-app"
      platform="windows"
      language="en"
    />,
  );
  return { container, workspace };
}

/** Lets the tab's lazily loaded page arrive: waits until it has drawn a title. */
async function settle(container: HTMLElement) {
  for (let turn = 0; turn < 300 && container.querySelector("main h1") === null; turn++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  }
}

function backLink(container: HTMLElement): HTMLAnchorElement | null {
  return container.querySelector<HTMLAnchorElement>('main nav[aria-label="Back"] a');
}

verifies("shell.page-back-link", () => {
  it("shows Back to Runs above the title of a real run's tab, and goes to Runs on a click", async () => {
    const { container, workspace } = renderWindow();
    act(() => workspace.tabs.openHere({ key: `run/local/${run.id}`, title: "Run" }));
    await settle(container);

    const link = backLink(container);
    expect(link?.getAttribute("aria-label")).toBe("Back to Runs");
    expect(link?.compareDocumentPosition(container.querySelector("main h1") as Node)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );

    act(() => link?.click());
    expect(workspace.tabs.active.history.at(-1)?.key).toBe("runs");
  });

  it("shows it above the title while the run is still loading", async () => {
    const { container, workspace } = renderWindow(true);
    act(() => workspace.tabs.openHere({ key: "run/local/run_x_000000", title: "Run" }));
    await settle(container);

    expect(backLink(container)?.getAttribute("aria-label")).toBe("Back to Runs");
  });
});
