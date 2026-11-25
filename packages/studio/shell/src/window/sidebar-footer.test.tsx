// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it } from "vitest";
import { createAnnouncer } from "../announcer/announcer.ts";
import { defineFeature } from "../feature.ts";
import type { BarItemContribution } from "../points/frame.ts";
import type { Registered } from "../points/point-store.ts";
import { createShell } from "../shell.ts";
import { ShellError } from "../shell-error.ts";
import { TabSet } from "../tabs/tab-set.ts";
import { FakeMediaQueries } from "../test-support/fake-media-query.ts";
import { FakeTimers } from "../test-support/fake-timers.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import type { WorkspaceContext } from "../workspace-context.ts";
import { StudioSidebar } from "./studio-sidebar.tsx";

let restoreMedia: () => void;

beforeEach(() => {
  restoreMedia = new FakeMediaQueries(1280).install();
});

afterEach(() => {
  unmountAll();
  restoreMedia();
});

const accountItem: Registered<BarItemContribution> = {
  featureId: "connections",
  id: "account-switcher",
  order: 1,
  view: "Account",
  load: async () => ({ Account: () => <button type="button">Ada</button> }),
};

async function renderSidebar(footer?: Registered<BarItemContribution>): Promise<HTMLElement> {
  const announcer = createAnnouncer({ timers: new FakeTimers() });
  const context = { services: { get: () => undefined }, announcer } as unknown as WorkspaceContext;
  const container = render(
    <StudioSidebar
      places={[]}
      tabs={new TabSet()}
      announcer={announcer}
      platform="windows"
      contextFor={() => context}
      onSearch={() => {}}
      footer={footer}
    />,
  );
  await act(async () => {
    await Promise.resolve();
  });
  return container;
}

verifies("shell.sidebar-footer", () => {
  it("draws the footer item at the bottom of the sidebar", async () => {
    const container = await renderSidebar(accountItem);
    expect(container.querySelector("[data-sidebar-footer] button")?.textContent).toBe("Ada");
  });

  it("draws no footer while no feature sets one", async () => {
    const container = await renderSidebar();
    expect(container.querySelector("[data-sidebar-footer]")).toBeNull();
  });

  it("serves the one item a feature set, and none before", () => {
    const set = (id: string) =>
      defineFeature({
        id,
        title: id,
        register: (studio) =>
          studio.sidebarFooter.add({
            id: "account",
            order: 1,
            view: "Account",
            load: async () => ({}),
          }),
      });
    expect(createShell({ features: [] }).contributions.sidebarFooter.item()).toBeUndefined();
    const shell = createShell({ features: [set("connections")] });
    expect(shell.contributions.sidebarFooter.item()?.featureId).toBe("connections");
  });

  it("refuses a second feature's item, naming both", () => {
    const set = (id: string) =>
      defineFeature({
        id,
        title: id,
        register: (studio) =>
          studio.sidebarFooter.add({
            id: `${id}-item`,
            order: 1,
            view: "V",
            load: async () => ({}),
          }),
      });
    const create = () => createShell({ features: [set("connections"), set("billing")] });
    expect(create).toThrow(ShellError);
    expect(create).toThrow(/"connections".*"billing"/);
  });
});
