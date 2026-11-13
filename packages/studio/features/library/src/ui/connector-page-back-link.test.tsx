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
import { afterEach, beforeAll, beforeEach, expect, it } from "vitest";
import { type ConnectorStatusHost, ConnectorStatusHostService } from "../connector-status-host.ts";
import { libraryFeature } from "../feature.ts";
import { render, unmountAll } from "../test-support/render.tsx";

const original = { matchMedia: window.matchMedia };

// The connector page loads lazily. On a busy CI machine the first import (transforming the page and
// everything behind it) can take longer than the test's own 5 s, so do it up front under the hook's
// longer limit; the test then only waits for the already loaded page to draw.
beforeAll(async () => {
  await import("./connector-page.tsx");
}, 60_000);

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

const host: ConnectorStatusHost = {
  list: async () => [{ id: "notes", name: "Notes", state: "connected" }],
  refusals: async () => [],
  subscribe: () => () => {},
};

/** A workspace with the real Library feature and one connector, Notes, behind it. */
function renderWindow() {
  const hostFeature = defineFeature({
    id: "connector-host",
    title: "Connector host",
    provides: [ConnectorStatusHostService],
    register(studio) {
      studio.services.provide(ConnectorStatusHostService, () => host);
    },
  });
  const shell = createShell({ features: [hostFeature, libraryFeature] });
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

verifies("shell.page-back-link", () => {
  it("shows Back to Library above the title of a real connector's tab, and goes to Library on a click", async () => {
    const { container, workspace } = renderWindow();
    act(() => workspace.tabs.openHere({ key: "connector/local/notes", title: "Notes" }));
    await settle(container);

    const link = container.querySelector<HTMLAnchorElement>('main nav[aria-label="Back"] a');
    expect(link?.getAttribute("aria-label")).toBe("Back to Library");
    expect(link?.compareDocumentPosition(container.querySelector("main h1") as Node)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );

    act(() => link?.click());
    expect(workspace.tabs.active.history.at(-1)?.key).toBe("library");
  });
});
