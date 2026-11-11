// @vitest-environment jsdom

import { TOOLTIP_DELAY_MS } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAnnouncer } from "../announcer/announcer.ts";
import { NameField } from "../item-page/name-field.tsx";
import { type TabLocation, TabSet } from "../tabs/tab-set.ts";
import { WindowTabStrip } from "../tabs/window-tab-strip.tsx";
import { FakeMediaQueries } from "../test-support/fake-media-query.ts";
import { installFakePopover, isPopoverOpen } from "../test-support/fake-popover.ts";
import { FakeTimers } from "../test-support/fake-timers.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { Toolbar } from "../toolbar/toolbar.tsx";

const home: TabLocation = { key: "home", title: "Home" };
const workflows: TabLocation = { key: "workflows", title: "Workflows" };
const reply: TabLocation = {
  key: "workflow/acme/reply",
  title: "Support reply for refunds over the limit",
  kind: "workflow",
};
const parentsOf = (location: TabLocation) => (location.key === reply.key ? [workflows] : []);

let uninstall: (() => void)[] = [];

beforeEach(() => {
  vi.useFakeTimers();
  uninstall = [new FakeMediaQueries(1440).install(), installFakePopover()];
});

afterEach(() => {
  unmountAll();
  for (const each of uninstall) {
    each();
  }
  vi.useRealTimers();
});

/** Makes `element` show `shown` pixels of a text `full` pixels wide, as layout would. */
function measure(element: Element, full: number, shown: number): void {
  Object.defineProperty(element, "scrollWidth", { configurable: true, value: full });
  Object.defineProperty(element, "clientWidth", { configurable: true, value: shown });
}

/** Rests a mouse pointer on `element` for the tooltip's delay. */
function hover(element: Element): void {
  act(() => {
    element.dispatchEvent(new PointerEvent("pointerover", { bubbles: true, pointerType: "mouse" }));
  });
  act(() => vi.advanceTimersByTime(TOOLTIP_DELAY_MS));
}

/** Focuses `element` as the keyboard would; jsdom can't tell `:focus-visible` by itself. */
function focusByKeyboard(element: HTMLElement): void {
  const matches = element.matches.bind(element);
  vi.spyOn(element, "matches").mockImplementation((selector) =>
    selector === ":focus-visible" ? true : matches(selector),
  );
  act(() => element.focus());
}

function shownTooltips(container: HTMLElement): string[] {
  return [...container.querySelectorAll("[role=tooltip]")]
    .filter(isPopoverOpen)
    .map((tooltip) => tooltip.textContent ?? "");
}

verifies("shell.cut-text-tooltips", () => {
  describe("window tabs", () => {
    function renderTabs() {
      const tabs = new TabSet();
      tabs.openHere(home);
      tabs.openInNewTab(reply);
      const container = render(<WindowTabStrip tabs={tabs} parentsOf={parentsOf} />);
      const [homeTab, replyTab] = [...container.querySelectorAll<HTMLElement>("[role=tab]")];
      return { container, homeTab, replyTab };
    }

    it("shows the tab's full path, which describes it", () => {
      const { container, replyTab } = renderTabs();
      hover(replyTab as HTMLElement);
      expect(shownTooltips(container)).toEqual([
        "Workflows / Support reply for refunds over the limit",
      ]);
      const tooltip = container.querySelector("[role=tooltip][data-popover-open]");
      expect(replyTab?.getAttribute("aria-describedby")).toBe(tooltip?.id);
    });

    it("says only the title on a tab with no places above it, and doesn't describe it", () => {
      const { container, homeTab } = renderTabs();
      hover(homeTab as HTMLElement);
      expect(shownTooltips(container)).toEqual(["Home"]);
      expect(homeTab?.hasAttribute("aria-describedby")).toBe(false);
    });
  });

  describe("the toolbar's path", () => {
    function renderPath() {
      const tabs = new TabSet();
      tabs.openHere(workflows);
      tabs.openHere(reply);
      const announcer = createAnnouncer({ timers: new FakeTimers() });
      const container = render(<Toolbar tabs={tabs} announcer={announcer} parentsOf={parentsOf} />);
      const link = container.querySelector("nav a") as HTMLElement;
      const current = container.querySelector('nav [aria-current="page"]') as HTMLElement;
      return { container, link, current };
    }

    it("shows the full title of a cut part, and none on a part that fits", () => {
      const { container, link, current } = renderPath();
      measure(link, 70, 70);
      measure(current, 280, 120);
      hover(link);
      expect(shownTooltips(container)).toEqual([]);
      hover(current);
      expect(shownTooltips(container)).toEqual(["Support reply for refunds over the limit"]);
      expect(current.hasAttribute("aria-describedby")).toBe(false);
    });

    it("shows a cut link's full title on keyboard focus too", () => {
      const { container, link } = renderPath();
      measure(link, 70, 40);
      focusByKeyboard(link);
      expect(shownTooltips(container)).toEqual(["Workflows"]);
      expect(link.hasAttribute("aria-describedby")).toBe(false);
    });
  });

  describe("the item's name field", () => {
    function renderName(onRename = vi.fn()) {
      const container = render(
        <NameField name={reply.title} label="Workflow name" onRename={onRename} />,
      );
      const field = container.querySelector("input") as HTMLInputElement;
      return { container, field };
    }

    it("shows a cut name in full on keyboard focus, without describing the field", () => {
      const { container, field } = renderName();
      measure(field, 320, 180);
      focusByKeyboard(field);
      expect(shownTooltips(container)).toEqual([reply.title]);
      expect(field.hasAttribute("aria-describedby")).toBe(false);
    });

    it("shows nothing while the name fits", () => {
      const { container, field } = renderName();
      measure(field, 180, 180);
      focusByKeyboard(field);
      expect(shownTooltips(container)).toEqual([]);
    });

    it("lets Esc put the old name back first, then hide the tooltip with the next Esc", () => {
      const { container, field } = renderName();
      measure(field, 320, 180);
      focusByKeyboard(field);
      act(() => {
        const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
        setValue?.call(field, "Support reply, edited");
        field.dispatchEvent(new Event("input", { bubbles: true }));
      });
      const pressEscape = () =>
        act(() => {
          field.dispatchEvent(
            new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
          );
        });
      pressEscape();
      expect(field.value).toBe(reply.title);
      expect(shownTooltips(container)).toHaveLength(1);
      pressEscape();
      expect(shownTooltips(container)).toEqual([]);
    });
  });
});
