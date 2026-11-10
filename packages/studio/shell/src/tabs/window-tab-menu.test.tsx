// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it } from "vitest";
import { FakeMediaQueries } from "../test-support/fake-media-query.ts";
import { installFakePopover, isPopoverOpen } from "../test-support/fake-popover.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { currentLocation, type TabLocation, TabSet } from "./tab-set.ts";
import { WindowTabStrip } from "./window-tab-strip.tsx";

const agents: TabLocation = { key: "agents", title: "Agents" };
const sorter: TabLocation = { key: "agent/acme/sorter", title: "Sorter", kind: "agent" };
const reply: TabLocation = { key: "workflow/acme/reply", title: "Support reply", kind: "workflow" };

let removePopover: () => void = () => undefined;
let uninstallMedia: () => void = () => undefined;

beforeEach(() => {
  removePopover = installFakePopover();
  uninstallMedia = new FakeMediaQueries(1440).install();
});

afterEach(() => {
  unmountAll();
  removePopover();
  uninstallMedia();
});

/** A strip over tabs on Agents, Support reply and Sorter, with Support reply active. */
function renderStrip() {
  const tabs = new TabSet();
  tabs.openHere(agents);
  tabs.openInNewTab(sorter);
  tabs.openInNewTab(reply);
  tabs.activate(tabs.state.tabs[1]?.id ?? "");
  const container = render(<WindowTabStrip tabs={tabs} />);
  const menu = container.querySelector<HTMLElement>("[role=menu]") as HTMLElement;
  return { tabs, container, menu };
}

function tabNamed(container: HTMLElement, title: string): HTMLElement {
  const tab = [...container.querySelectorAll<HTMLElement>("[role=tab]")].find((each) =>
    each.getAttribute("aria-label")?.startsWith(title),
  );
  return tab as HTMLElement;
}

function item(menu: HTMLElement, label: string): HTMLElement {
  const items = [...menu.querySelectorAll<HTMLElement>("[role=menuitem]")];
  return items.find((each) => each.textContent === label) as HTMLElement;
}

function titles(tabs: TabSet): string[] {
  return tabs.state.tabs.map((tab) => currentLocation(tab).title);
}

function press(key: string, modifiers: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
    ...modifiers,
  });
  act(() => {
    document.activeElement?.dispatchEvent(event);
  });
  return event;
}

function rightClick(target: Element): MouseEvent {
  const event = new MouseEvent("contextmenu", {
    bubbles: true,
    cancelable: true,
    button: 2,
    clientX: 300,
    clientY: 20,
  });
  act(() => {
    target.dispatchEvent(event);
  });
  return event;
}

function click(target: Element): void {
  act(() => {
    target.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

verifies("shell.window-tab-menu", () => {
  it("opens below the focused tab with Shift F10 or the Menu key, focus on Close", () => {
    for (const [key, modifiers] of [
      ["F10", { shiftKey: true }],
      ["ContextMenu", {}],
    ] as const) {
      const { container, menu } = renderStrip();
      tabNamed(container, "Support reply").focus();
      expect(press(key, modifiers).defaultPrevented).toBe(true);
      expect(isPopoverOpen(menu)).toBe(true);
      expect(menu.getAttribute("aria-label")).toBe("Support reply");
      expect(document.activeElement).toBe(item(menu, "Close"));
      unmountAll();
    }
  });

  it("lists Close, Close other tabs and Reopen closed tab, with no keys shown", () => {
    const { container, menu } = renderStrip();
    rightClick(tabNamed(container, "Agents"));
    const labels = [...menu.querySelectorAll("[role=menuitem]")].map((each) => each.textContent);
    expect(labels).toEqual(["Close", "Close other tabs", "Reopen closed tab"]);
    expect(menu.querySelector("kbd")).toBeNull();
    expect(item(menu, "Reopen closed tab").getAttribute("aria-disabled")).toBe("true");
    expect(item(menu, "Close other tabs").hasAttribute("aria-disabled")).toBe(false);
  });

  it("opens at the pointer on a right-click without making the tab active", () => {
    const { tabs, container, menu } = renderStrip();
    const event = rightClick(tabNamed(container, "Agents"));
    expect(event.defaultPrevented).toBe(true);
    expect(isPopoverOpen(menu)).toBe(true);
    expect(menu.getAttribute("aria-label")).toBe("Agents");
    expect(document.activeElement).toBe(menu);
    expect(currentLocation(tabs.active).title).toBe("Support reply");
  });

  it("ignores the Menu key's own contextmenu after its keydown opened the menu", () => {
    const { container, menu } = renderStrip();
    tabNamed(container, "Support reply").focus();
    press("ContextMenu");
    const first = item(menu, "Close");
    rightClick(tabNamed(container, "Support reply"));
    expect(document.activeElement).toBe(first);
  });

  it("closes the tab with Close and moves the focus to the tab that became active", () => {
    const { tabs, container, menu } = renderStrip();
    tabNamed(container, "Support reply").focus();
    press("F10", { shiftKey: true });
    press("Enter");
    expect(titles(tabs)).toEqual(["Agents", "Sorter"]);
    expect(isPopoverOpen(menu)).toBe(false);
    expect(document.activeElement).toBe(tabNamed(container, "Sorter"));
  });

  it("closes the other tabs, keeps the focus on the tab, and Reopen closed tab brings one back", () => {
    const { tabs, container, menu } = renderStrip();
    rightClick(tabNamed(container, "Agents"));
    click(item(menu, "Close other tabs"));
    expect(titles(tabs)).toEqual(["Agents"]);
    expect(document.activeElement).toBe(tabNamed(container, "Agents"));

    rightClick(tabNamed(container, "Agents"));
    expect(item(menu, "Close other tabs").getAttribute("aria-disabled")).toBe("true");
    click(item(menu, "Reopen closed tab"));
    expect(titles(tabs)).toEqual(["Agents", "Support reply"]);
    expect(document.activeElement).toBe(tabNamed(container, "Support reply"));
  });

  it("gives the focus back to the tab on Escape", () => {
    const { container, menu } = renderStrip();
    const tab = tabNamed(container, "Support reply");
    tab.focus();
    press("F10", { shiftKey: true });
    press("Escape");
    expect(isPopoverOpen(menu)).toBe(false);
    expect(document.activeElement).toBe(tab);
  });

  it("leaves Shift F10 with Ctrl, Alt or Meta to the window", () => {
    const { container, menu } = renderStrip();
    tabNamed(container, "Support reply").focus();
    for (const modifier of ["ctrlKey", "altKey", "metaKey"]) {
      expect(press("F10", { shiftKey: true, [modifier]: true }).defaultPrevented).toBe(false);
    }
    expect(isPopoverOpen(menu)).toBe(false);
  });
});
