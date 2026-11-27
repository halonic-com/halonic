// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it } from "vitest";
import { createAnnouncer } from "../announcer/announcer.ts";
import { type PlaceContribution, sidebarPlaces } from "../points/frame.ts";
import type { Registered } from "../points/point-store.ts";
import { TabSet } from "../tabs/tab-set.ts";
import { FakeMediaQueries } from "../test-support/fake-media-query.ts";
import { FakeTimers } from "../test-support/fake-timers.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import type { WorkspaceContext } from "../workspace-context.ts";
import { StudioSidebar } from "./studio-sidebar.tsx";

let restoreMedia: () => void;

beforeEach(() => {
  restoreMedia = new FakeMediaQueries(1000).install();
});

afterEach(() => {
  unmountAll();
  restoreMedia();
});

/** Every place the sidebar knows, the longest it gets. */
function everyPlace(): Registered<PlaceContribution>[] {
  return sidebarPlaces.map((id) => ({
    featureId: id,
    id,
    view: `${id}View`,
    load: async () => ({}),
  }));
}

/** The classes of an element, as a list. */
function classesOf(element: Element | null | undefined): string[] {
  return element?.className.split(" ") ?? [];
}

verifies("shell.sidebar-scroll", () => {
  // jsdom lays nothing out, so the test checks the classes that make the region scroll.
  it("scrolls the places inside the sidebar, while the Search box stays put above them", () => {
    const announcer = createAnnouncer({ timers: new FakeTimers() });
    const context = {
      services: { get: () => undefined },
      announcer,
    } as unknown as WorkspaceContext;
    const container = render(
      <StudioSidebar
        places={everyPlace()}
        tabs={new TabSet()}
        announcer={announcer}
        platform="windows"
        contextFor={() => context}
        onSearch={() => {}}
      />,
    );
    const sidebar = container.firstElementChild;
    const scroller = container.querySelector("[data-sidebar-scroll]");
    const search = [...container.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Search"),
    );

    expect(classesOf(sidebar)).not.toContain("overflow-y-auto");
    expect(classesOf(scroller)).toEqual(
      expect.arrayContaining(["min-h-0", "flex-1", "overflow-y-auto"]),
    );
    expect(scroller?.querySelector('nav[aria-label="Places"]')).not.toBeNull();
    expect(search).toBeDefined();
    expect(scroller?.contains(search ?? null)).toBe(false);
  });
});
