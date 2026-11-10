// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it } from "vitest";
import { FakeMediaQueries } from "../test-support/fake-media-query.ts";
import { installFakePopover } from "../test-support/fake-popover.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { currentLocation, type TabLocation, TabSet } from "./tab-set.ts";
import { WindowTabStrip } from "./window-tab-strip.tsx";

const agents: TabLocation = { key: "agents", title: "Agents" };
const sorter: TabLocation = { key: "agent/acme/sorter", title: "Sorter", kind: "agent" };
const reply: TabLocation = { key: "workflow/acme/reply", title: "Support reply", kind: "workflow" };

let media: FakeMediaQueries;
let uninstall: (() => void)[] = [];

beforeEach(() => {
  media = new FakeMediaQueries(800);
  uninstall = [media.install(), installFakePopover()];
});

afterEach(() => {
  unmountAll();
  for (const takeOut of uninstall) {
    takeOut();
  }
});

/** A narrow window's strip over tabs on Agents, Sorter and Support reply, with Sorter active. */
function renderStrip(options: { readonly needsYou?: (location: TabLocation) => boolean } = {}) {
  const tabs = new TabSet();
  tabs.openHere(agents);
  // Each new tab opens next to Agents, so they read Agents, Sorter, Support reply.
  tabs.openInNewTab(reply);
  tabs.openInNewTab(sorter);
  const sorterTab = tabs.state.tabs.find((tab) => currentLocation(tab).title === "Sorter");
  tabs.activate(sorterTab?.id ?? "");
  const container = render(<WindowTabStrip tabs={tabs} needsYou={options.needsYou} />);
  const button = () => container.querySelector<HTMLButtonElement>('[aria-haspopup="menu"]');
  const items = () => [...container.querySelectorAll<HTMLElement>('[role="menuitemradio"]')];
  return { tabs, container, button, items };
}

verifies("shell.open-tabs-menu", () => {
  it("folds the tabs into one button that opens a menu, with + after it", () => {
    const { container, button, items } = renderStrip();
    expect(container.querySelector('[role="tablist"]')).toBeNull();
    expect(button()?.textContent).toBe("3 open tabs");
    expect(button()?.getAttribute("aria-label")).toBeNull();
    expect(button()?.querySelector(".bg-warning")).toBeNull();
    expect(container.querySelector('[aria-label="New tab"]')).not.toBeNull();
    expect(items().map((item) => item.textContent)).toEqual(["Agents", "Sorter", "Support reply"]);
    expect(items().map((item) => item.getAttribute("aria-checked"))).toEqual([
      "false",
      "true",
      "false",
    ]);
  });

  it("shows the dot and says how many tabs need you", () => {
    const { button, items } = renderStrip({ needsYou: (location) => location.key === reply.key });
    expect(button()?.getAttribute("aria-label")).toBe("3 open tabs, 1 needs you");
    expect(button()?.querySelector(".bg-warning")?.getAttribute("aria-hidden")).toBe("true");
    expect(items()[2]?.textContent).toBe("Support reply, needs you");
  });

  it("counts two tabs that need you as 2 need you", () => {
    const { button } = renderStrip({ needsYou: (location) => location.key !== agents.key });
    expect(button()?.getAttribute("aria-label")).toBe("3 open tabs, 2 need you");
  });

  it("makes the picked tab active", () => {
    const { tabs, items } = renderStrip();
    act(() => items()[2]?.click());
    const active = tabs.state.tabs.find((tab) => tab.id === tabs.state.activeId);
    expect(active === undefined ? undefined : currentLocation(active).title).toBe("Support reply");
  });

  it("reads 1 open tab for one tab", () => {
    const tabs = new TabSet();
    tabs.openHere(agents);
    const container = render(<WindowTabStrip tabs={tabs} />);
    expect(container.querySelector('[aria-haspopup="menu"]')?.textContent).toBe("1 open tab");
  });

  it("shows the tabs again when the window widens", () => {
    const { container, button } = renderStrip();
    act(() => media.resize(1440));
    expect(button()).toBeNull();
    expect(container.querySelectorAll('[role="tab"]')).toHaveLength(3);
  });
});
