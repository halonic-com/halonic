// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { createAnnouncer } from "../announcer/announcer.ts";
import { currentLocation, type TabLocation, TabSet } from "../tabs/tab-set.ts";
import { FakeTimers } from "../test-support/fake-timers.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { Toolbar, type ToolbarProps } from "./toolbar.tsx";

const workflows: TabLocation = { key: "workflows", title: "Workflows" };
const reply: TabLocation = { key: "workflow/acme/reply", title: "Support reply", kind: "workflow" };

afterEach(unmountAll);

/** A toolbar over one tab that went from Home to Workflows to Support reply. */
function renderToolbar(props: Partial<ToolbarProps> = {}) {
  const tabs = new TabSet();
  tabs.openHere(workflows);
  tabs.openHere(reply);
  const timers = new FakeTimers();
  const announcer = createAnnouncer({ timers });
  const said: string[] = [];
  announcer.mountRegions({
    polite: { say: (text) => said.push(text) },
    assertive: { say: (text) => said.push(text) },
  });
  const parentsOf = (location: TabLocation) => (location.key === reply.key ? [workflows] : []);
  const container = render(
    <Toolbar tabs={tabs} announcer={announcer} parentsOf={parentsOf} {...props} />,
  );
  /** What was read out once the announcer's flush has run. */
  const announced = () => {
    timers.advance(0);
    return said;
  };
  return { tabs, container, announced };
}

function button(container: HTMLElement, name: string): HTMLButtonElement {
  return container.querySelector(`button[aria-label="${name}"]`) as HTMLButtonElement;
}

function click(target: Element | null, init: MouseEventInit = {}): MouseEvent {
  const event = new MouseEvent("click", { bubbles: true, cancelable: true, ...init });
  act(() => {
    target?.dispatchEvent(event);
  });
  return event;
}

function pathText(container: HTMLElement): string {
  return container.querySelector('nav[aria-label="Location"]')?.textContent ?? "";
}

verifies("shell.toolbar", () => {
  describe("Toolbar", () => {
    it("shows the active tab's path in a nav named Location, the parts before the last as links", () => {
      const { container } = renderToolbar();
      expect(pathText(container)).toBe("Workflows/Support reply");
      const links = [...container.querySelectorAll("nav a")].map((link) => link.textContent);
      expect(links).toEqual(["Workflows"]);
      const current = container.querySelector('[aria-current="page"]');
      expect(current?.tagName).toBe("SPAN");
      expect(current?.textContent).toBe("Support reply");
    });

    it("goes Back and Forward in the active tab and follows it", () => {
      const { tabs, container } = renderToolbar();
      click(button(container, "Back"));
      expect(currentLocation(tabs.active).title).toBe("Workflows");
      expect(pathText(container)).toBe("Workflows");
      click(button(container, "Forward"));
      expect(pathText(container)).toBe("Workflows/Support reply");
    });

    it("keeps Back and Forward in the Tab order when there's nowhere to go, and says why", () => {
      const { tabs, container } = renderToolbar();
      const forward = button(container, "Forward");
      expect(forward.getAttribute("aria-disabled")).toBe("true");
      expect(forward.tabIndex).toBe(0);
      const reason = document.getElementById(forward.getAttribute("aria-describedby") ?? "");
      expect(reason?.textContent).toBe("Nothing to go forward to");
      expect(button(container, "Back").getAttribute("aria-disabled")).toBeNull();

      click(forward);
      expect(currentLocation(tabs.active).title).toBe("Support reply");
      act(() => {
        tabs.back();
        tabs.back();
      });
      const back = button(container, "Back");
      expect(back.getAttribute("aria-disabled")).toBe("true");
      const backReason = document.getElementById(back.getAttribute("aria-describedby") ?? "");
      expect(backReason?.textContent).toBe("Nothing to go back to");
    });

    it("opens a path part in the active tab on a click, without following the address", () => {
      const { tabs, container } = renderToolbar();
      const event = click(container.querySelector("nav a"));
      expect(event.defaultPrevented).toBe(true);
      expect(tabs.state.tabs).toHaveLength(1);
      expect(currentLocation(tabs.active).title).toBe("Workflows");
    });

    it("opens a path part in a new tab on a Ctrl-click, stays put and says so", () => {
      const { tabs, container, announced } = renderToolbar();
      click(container.querySelector("nav a"), { ctrlKey: true });
      expect(tabs.state.tabs.map((tab) => currentLocation(tab).title)).toEqual([
        "Support reply",
        "Workflows",
      ]);
      expect(currentLocation(tabs.active).title).toBe("Support reply");
      expect(announced()).toEqual(["Opened Workflows in a new tab."]);
    });

    it("opens a path part in a new tab on a middle-click", () => {
      const { tabs, container } = renderToolbar();
      act(() => {
        container
          .querySelector("nav a")
          ?.dispatchEvent(new MouseEvent("auxclick", { bubbles: true, button: 1 }));
      });
      expect(tabs.state.tabs).toHaveLength(2);
    });

    it("leaves the tabs as they are on a Ctrl-click on a part a tab shows, and says so", () => {
      const { tabs, container, announced } = renderToolbar();
      tabs.openInNewTab(workflows);
      const before = tabs.state;
      click(container.querySelector("nav a"), { metaKey: true });
      expect(tabs.state).toBe(before);
      expect(announced()).toEqual(["Workflows is already open in a tab."]);
    });

    it("shows the place alone when nothing says what is above it", () => {
      const { container } = renderToolbar({ parentsOf: undefined });
      expect(pathText(container)).toBe("Support reply");
    });

    it("shows the badges and the save state at the end, and an empty slot takes no room", () => {
      const withBoth = renderToolbar({
        badges: <span>Not trusted yet</span>,
        saveState: <span>✓ Saved</span>,
      }).container;
      const ends = [...withBoth.children].slice(-2).map((slot) => slot.textContent);
      expect(ends).toEqual(["Not trusted yet", "✓ Saved"]);

      const empty = renderToolbar({ badges: null }).container;
      expect(empty.lastElementChild?.tagName).toBe("NAV");
    });

    it("has no Assistant button until the Assistant lands", () => {
      const { container } = renderToolbar();
      const names = [...container.querySelectorAll("button")].map((b) => b.ariaLabel);
      expect(names).toEqual(["Back", "Forward"]);
      const sizes = [...container.querySelectorAll("button")].map((b) => b.className);
      expect(sizes.every((name) => name.includes("size-control-md"))).toBe(true);
    });
  });
});
