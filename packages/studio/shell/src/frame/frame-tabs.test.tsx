// @vitest-environment jsdom

import { createToastStore } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { act, type ReactNode } from "react";
import { afterEach, beforeEach, expect, it } from "vitest";
import { createAnnouncer } from "../announcer/announcer.ts";
import { createCloseStack } from "../close-stack/close-stack.ts";
import { createShellEngine } from "../engine/engine-connection.ts";
import { TabSet } from "../tabs/tab-set.ts";
import { WindowTabStrip } from "../tabs/window-tab-strip.tsx";
import { FakeMediaQueries } from "../test-support/fake-media-query.ts";
import { FakeTimers } from "../test-support/fake-timers.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { ShellFrame } from "./shell-frame.tsx";

let media: FakeMediaQueries;
let uninstall: () => void;

beforeEach(() => {
  media = new FakeMediaQueries(1440);
  uninstall = media.install();
});

afterEach(() => {
  unmountAll();
  uninstall();
});

/** The real strip over tabs on Agents and Sorter, with the one at `activeIndex` active. */
function stripWithActiveTab(activeIndex: number) {
  const tabs = new TabSet();
  tabs.openHere({ key: "agents", title: "Agents" });
  tabs.openInNewTab({ key: "agent/acme/sorter", title: "Sorter" });
  tabs.activate(tabs.state.tabs[activeIndex]?.id ?? "");
  return <WindowTabStrip tabs={tabs} />;
}

function renderFrame(tabs: ReactNode = <div role="tablist" aria-label="Open tabs" />) {
  const timers = new FakeTimers();
  const announcer = createAnnouncer({ timers });
  return render(
    <ShellFrame
      announcer={announcer}
      closeStack={createCloseStack()}
      engine={createShellEngine(announcer, timers)}
      toasts={createToastStore()}
      language="en"
      titleBar={<button type="button">Back</button>}
      tabs={tabs}
    >
      <h1>Home</h1>
    </ShellFrame>,
  );
}

verifies("shell.frame", () => {
  it("puts the window tabs on the frame right above the framed panel, not in the title bar", () => {
    const container = renderFrame();
    const panel = container.querySelector("[data-framed-panel]");
    const tabs = container.querySelector('[role="tablist"]');
    const row = container.querySelector("[data-panel-tabs]");
    const rowClasses = row?.className.split(" ") ?? [];

    expect(container.querySelector("header")?.contains(tabs)).toBe(false);
    expect(row?.contains(tabs)).toBe(true);
    // Outside the element with the panel's fill, on no fill of its own, so the frame shows under
    // the tabs and the active tab's fill stands out from it (HAL-21209).
    expect(panel?.contains(tabs)).toBe(false);
    expect(panel?.className).toContain("bg-surface");
    expect(rowClasses.filter((name) => name.startsWith("bg-"))).toEqual([]);
    // Right before the panel in one column, with no inset, so the active tab starts at its edge.
    expect(row?.nextElementSibling).toBe(panel);
    expect(rowClasses.filter((name) => /^-?[mp][sx]-/.test(name))).toEqual([]);
    expect(panel?.querySelector("main")).not.toBeNull();
  });

  it("squares the panel's top start corner under the tabs only while a tab can join it", () => {
    const container = renderFrame();
    const panel = container.querySelector("[data-framed-panel]");
    expect(panel?.className.split(" ")).toContain("rounded-ss-none");

    act(() => media.resize(800));
    expect(panel?.className.split(" ")).not.toContain("rounded-ss-none");
  });

  it("doesn't clip the tab row, so the focus ring of + at its end stays whole", () => {
    const container = renderFrame();
    const row = container.querySelector("[data-panel-tabs]");
    expect(row?.className).not.toMatch(/overflow/);

    act(() => media.resize(800));
    expect(row?.className).not.toMatch(/overflow/);
  });

  // HAL-21213: pieces past the active tab's sides painted over the foot of its side lines and over
  // the panel's top line beside it, so the outline broke 5px above the panel.
  for (const activeIndex of [0, 1]) {
    it(`runs tab ${activeIndex + 1}'s side lines, while active, down into the panel's top line`, () => {
      const container = renderFrame(stripWithActiveTab(activeIndex));
      const active = container.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]');
      const classes = active?.className.split(" ") ?? [];

      expect(active?.getAttribute("aria-label")).toBe(["Agents", "Sorter"][activeIndex]);
      // Side lines down to its foot, 1px past the strip, over the panel's top line.
      expect(classes).toEqual(expect.arrayContaining(["border", "border-b-0", "-mb-px"]));
      const outside = [...(active?.querySelectorAll("[aria-hidden]") ?? [])].filter((piece) =>
        /(^| )-(start|end)-/.test(piece.className),
      );
      expect(outside).toEqual([]);
      const strip = container.querySelector('[role="tablist"]');
      expect(strip?.className).not.toMatch(/(^| )-?(mx|px)-/);
    });
  }

  it("shows no tabs on a phone", () => {
    const container = renderFrame();
    act(() => media.resize(390));

    expect(container.querySelector('[role="tablist"]')).toBeNull();
  });
});
