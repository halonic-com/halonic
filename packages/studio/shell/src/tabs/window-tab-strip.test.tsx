// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { render, unmountAll } from "../test-support/render.tsx";
import { currentLocation, type TabLocation, TabSet } from "./tab-set.ts";
import { WindowTabStrip } from "./window-tab-strip.tsx";

const agents: TabLocation = { key: "agents", title: "Agents" };
const sorter: TabLocation = { key: "agent/acme/sorter", title: "Sorter", kind: "agent" };
const reply: TabLocation = { key: "workflow/acme/reply", title: "Support reply", kind: "workflow" };

afterEach(unmountAll);

/** A strip over tabs on Agents, Sorter and Support reply, with Sorter active. */
function renderStrip(options: { needsYou?: (location: TabLocation) => boolean } = {}) {
  const tabs = new TabSet();
  tabs.openHere(agents);
  tabs.openInNewTab(reply);
  tabs.openInNewTab(sorter);
  tabs.activate(tabs.state.tabs[1]?.id ?? "");
  const opened: string[] = [];
  const container = render(
    <WindowTabStrip
      tabs={tabs}
      needsYou={options.needsYou}
      onNewTab={(tab) => opened.push(tab.id)}
    />,
  );
  return { tabs, container, opened };
}

function tabElements(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>('[role="tab"]')];
}

function names(container: HTMLElement): string[] {
  return tabElements(container).map((tab) => tab.getAttribute("aria-label") ?? "");
}

function titles(tabs: TabSet): string[] {
  return tabs.state.tabs.map((tab) => currentLocation(tab).title);
}

function press(target: Element, key: string, modifiers: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
    ...modifiers,
  });
  act(() => {
    target.dispatchEvent(event);
  });
  return event;
}

function click(target: Element | null | undefined): void {
  act(() => {
    target?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

/** Lays the tabs out as jsdom can't: 200px each, from x = 0, in the DOM's order. */
function layOut(container: HTMLElement): void {
  tabElements(container).forEach((tab) => {
    tab.getBoundingClientRect = () => {
      const left = tabElements(container).indexOf(tab) * 200;
      return { left, width: 200 } as DOMRect;
    };
  });
}

/**
 * A pointer event as jsdom can make one: a `MouseEvent` with the pointer type's name. `buttons` is
 * the buttons held, so a move with the main button down has `buttons: 1`.
 */
function pointer(type: string, clientX: number, buttons: number, button = 0): MouseEvent {
  return new MouseEvent(type, { bubbles: true, cancelable: true, button, buttons, clientX });
}

/** Presses the main button on `target` at `x`, and leaves it held. */
function pressPointer(target: Element, x: number): void {
  act(() => {
    target.dispatchEvent(pointer("pointerdown", x, 1));
  });
}

/** Moves the pointer to `x`, with the main button held unless `buttons` says otherwise. */
function movePointer(x: number, buttons = 1): void {
  act(() => {
    window.dispatchEvent(pointer("pointermove", x, buttons));
  });
}

/** Presses `button` on `target` at `fromX`, moves the pointer to each of `toX`, and lets go. */
function drag(target: Element, fromX: number, toX: readonly number[], button = 0): void {
  const held = 1 << button;
  act(() => {
    target.dispatchEvent(pointer("pointerdown", fromX, held, button));
  });
  for (const x of toX) {
    act(() => {
      window.dispatchEvent(pointer("pointermove", x, held, button));
    });
  }
  act(() => {
    window.dispatchEvent(pointer("pointerup", toX.at(-1) ?? fromX, 0, button));
  });
}

verifies("shell.window-tab-strip", () => {
  describe("WindowTabStrip", () => {
    it("is a tablist named Open tabs, each tab named by its place and kind", () => {
      const { container } = renderStrip();
      expect(container.querySelector('[role="tablist"]')?.getAttribute("aria-label")).toBe(
        "Open tabs",
      );
      expect(names(container)).toEqual(["Agents", "Sorter, agent", "Support reply, workflow"]);
      const selected = tabElements(container).map((tab) => tab.getAttribute("aria-selected"));
      expect(selected).toEqual(["false", "true", "false"]);
    });

    it("adds needs you to the name and shows the dot only on a tab whose item waits", () => {
      const { container } = renderStrip({ needsYou: (location) => location.key === reply.key });
      expect(names(container)[2]).toBe("Support reply, workflow, needs you");
      const dots = tabElements(container).map((tab) => tab.querySelector(".bg-warning") !== null);
      expect(dots).toEqual([false, false, true]);
    });

    it("is one Tab stop: only the active tab is in the Tab order", () => {
      const { container } = renderStrip();
      const order = tabElements(container).map((tab) => tab.tabIndex);
      expect(order).toEqual([-1, 0, -1]);
      const closeButtons = container.querySelectorAll<HTMLElement>('[aria-label^="Close "]');
      expect([...closeButtons].map((button) => button.tabIndex)).toEqual([-1, -1, -1]);
    });

    it("gives the Tab stop back to the active tab when the focus leaves the strip", () => {
      const { tabs, container } = renderStrip();
      const [first, second] = tabElements(container);
      act(() => second?.focus());
      press(second as HTMLElement, "ArrowLeft");
      expect(tabElements(container).map((tab) => tab.tabIndex)).toEqual([0, -1, -1]);
      act(() => first?.blur());
      act(() => tabs.activate(tabs.state.tabs[2]?.id ?? ""));
      expect(tabElements(container).map((tab) => tab.tabIndex)).toEqual([-1, -1, 0]);
    });

    it("keeps the Tab stop on the active tab after a click when it changes from outside", () => {
      const { tabs, container } = renderStrip();
      click(tabElements(container)[0]);
      act(() => tabs.activate(tabs.state.tabs[2]?.id ?? ""));
      expect(tabElements(container).map((tab) => tab.tabIndex)).toEqual([-1, -1, 0]);
    });

    it("moves the focus with the arrow keys and opens a tab with Enter or Space", () => {
      const { tabs, container } = renderStrip();
      const [first, second, third] = tabElements(container);
      act(() => second?.focus());
      press(second as HTMLElement, "ArrowRight");
      expect(document.activeElement).toBe(third);
      expect(third?.tabIndex).toBe(0);
      expect(currentLocation(tabs.active).title).toBe("Sorter");
      press(third as HTMLElement, "ArrowRight");
      expect(document.activeElement).toBe(third);
      press(third as HTMLElement, "Enter");
      expect(currentLocation(tabs.active).title).toBe("Support reply");
      press(third as HTMLElement, "ArrowLeft");
      press(second as HTMLElement, "ArrowLeft");
      expect(document.activeElement).toBe(first);
      press(first as HTMLElement, " ");
      expect(currentLocation(tabs.active).title).toBe("Agents");
    });

    it("closes the focused tab with Delete and keeps the focus in the strip", () => {
      const { tabs, container } = renderStrip();
      const second = tabElements(container)[1] as HTMLElement;
      act(() => second.focus());
      press(second, "Delete");
      expect(titles(tabs)).toEqual(["Agents", "Support reply"]);
      expect(currentLocation(tabs.active).title).toBe("Support reply");
      expect(document.activeElement?.getAttribute("aria-label")).toBe("Support reply, workflow");
    });

    it("moves the focused tab with Ctrl Shift PageUp and PageDown, focus on it", () => {
      const { tabs, container } = renderStrip();
      const second = tabElements(container)[1] as HTMLElement;
      act(() => second.focus());
      press(second, "PageDown", { ctrlKey: true, shiftKey: true });
      expect(titles(tabs)).toEqual(["Agents", "Support reply", "Sorter"]);
      expect(document.activeElement?.getAttribute("aria-label")).toBe("Sorter, agent");
      press(document.activeElement as HTMLElement, "PageUp", { ctrlKey: true, shiftKey: true });
      press(document.activeElement as HTMLElement, "PageUp", { ctrlKey: true, shiftKey: true });
      expect(titles(tabs)).toEqual(["Sorter", "Agents", "Support reply"]);
    });

    it("leaves other keys and modified arrows to the window", () => {
      const { container } = renderStrip();
      const second = tabElements(container)[1] as HTMLElement;
      expect(press(second, "ArrowRight", { altKey: true }).defaultPrevented).toBe(false);
      expect(press(second, "PageDown", { ctrlKey: true }).defaultPrevented).toBe(false);
      expect(press(second, "a").defaultPrevented).toBe(false);
    });

    it("opens a tab on click and closes one with its close button, named after it", () => {
      const { tabs, container } = renderStrip();
      click(tabElements(container)[0]);
      expect(currentLocation(tabs.active).title).toBe("Agents");
      click(container.querySelector('[aria-label="Close Support reply"]'));
      expect(titles(tabs)).toEqual(["Agents", "Sorter"]);
      expect(currentLocation(tabs.active).title).toBe("Agents");
    });

    it("keeps the focus where it is when the close button is pressed", () => {
      const { container } = renderStrip();
      const button = container.querySelector('[aria-label="Close Support reply"]') as HTMLElement;
      const event = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
      act(() => {
        button.dispatchEvent(event);
      });
      expect(event.defaultPrevented).toBe(true);
    });

    it("shows the close button on the active tab, and on the others only on hover or focus", () => {
      const { container } = renderStrip();
      const hidden = [...container.querySelectorAll('[aria-label^="Close "]')].map((button) =>
        button.className.split(" ").includes("invisible"),
      );
      expect(hidden).toEqual([true, false, true]);
    });

    it("opens a new tab on Home at the end with + and tells the frame", () => {
      const { tabs, container, opened } = renderStrip();
      click(container.querySelector('[aria-label="New tab"]'));
      expect(titles(tabs)).toEqual(["Agents", "Sorter", "Support reply", "Home"]);
      expect(opened).toEqual([tabs.active.id]);
    });

    it("follows the tab set, so a renamed item's tab shows its new name at once", () => {
      const { tabs, container } = renderStrip();
      act(() => tabs.rename(sorter.key, "Mail sorter"));
      expect(names(container)[1]).toBe("Mail sorter, agent");
    });

    it("uses no fg-subtle on a tab, which falls below 4.5:1 on the hovered tab", () => {
      const { container } = renderStrip({ needsYou: () => true });
      const classes = [...container.querySelectorAll("*")].map((element) => element.className);
      expect(classes.filter((name) => String(name).includes("fg-subtle"))).toEqual([]);
    });

    it("moves a dragged tab as the pointer crosses a neighbour's middle, and stops on release", () => {
      const { tabs, container } = renderStrip();
      layOut(container);
      const [first] = tabElements(container);
      drag(first as HTMLElement, 100, [290, 310]);
      expect(titles(tabs)).toEqual(["Sorter", "Agents", "Support reply"]);
      layOut(container);
      drag(first as HTMLElement, 100, []);
      movePointer(590);
      expect(titles(tabs)).toEqual(["Sorter", "Agents", "Support reply"]);
    });

    it("leaves a press that hardly moves to the click, and a middle-button drag alone", () => {
      const { tabs, container } = renderStrip();
      layOut(container);
      const [first] = tabElements(container);
      drag(first as HTMLElement, 100, [103]);
      drag(first as HTMLElement, 100, [590], 1);
      expect(titles(tabs)).toEqual(["Agents", "Sorter", "Support reply"]);
    });

    it("swallows the click after a drag, so letting go over the tab's close button keeps it", () => {
      const { tabs, container } = renderStrip();
      layOut(container);
      const closeAgents = container.querySelector('[aria-label="Close Agents"]') as HTMLElement;
      drag(closeAgents, 180, [380]);
      click(closeAgents);
      expect(titles(tabs)).toEqual(["Sorter", "Agents", "Support reply"]);
      drag(closeAgents, 380, [381]);
      click(closeAgents);
      expect(titles(tabs)).toEqual(["Sorter", "Support reply"]);
    });

    it("lets the next click through when a drag's release brought no click", () => {
      const { tabs, container } = renderStrip();
      layOut(container);
      const [first] = tabElements(container);
      drag(first as HTMLElement, 100, [310]);
      pressPointer(first as HTMLElement, 100);
      click(container.querySelector('[aria-label="Close Support reply"]'));
      expect(titles(tabs)).toEqual(["Sorter", "Agents"]);
    });

    it("ends a drag when a move comes with the main button up, after a release it missed", () => {
      const { tabs, container } = renderStrip();
      layOut(container);
      const [first] = tabElements(container);
      pressPointer(first as HTMLElement, 100);
      movePointer(310);
      expect(titles(tabs)).toEqual(["Sorter", "Agents", "Support reply"]);
      movePointer(590, 0);
      movePointer(590);
      expect(titles(tabs)).toEqual(["Sorter", "Agents", "Support reply"]);
    });

    it("stops following the pointer when the strip goes mid-drag", () => {
      const { tabs, container } = renderStrip();
      layOut(container);
      const [first] = tabElements(container);
      pressPointer(first as HTMLElement, 100);
      unmountAll();
      movePointer(590);
      expect(titles(tabs)).toEqual(["Agents", "Sorter", "Support reply"]);
    });
  });
});
