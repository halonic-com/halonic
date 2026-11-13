// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { act, useCallback, useSyncExternalStore } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { currentLocation, type TabLocation, TabSet } from "../tabs/tab-set.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { HistoryButtons } from "./history-buttons.tsx";

const workflows: TabLocation = { key: "workflows", title: "Workflows" };
const reply: TabLocation = { key: "workflow/acme/reply", title: "Support reply", kind: "workflow" };

afterEach(unmountAll);

/** A page as the frame shows it: a `main` whose `h1` is the active tab's place. */
function Page({ tabs }: { readonly tabs: TabSet }) {
  useSyncExternalStore(
    useCallback((listener) => tabs.subscribe(listener), [tabs]),
    () => tabs.state,
  );
  return (
    <main>
      <h1>{currentLocation(tabs.active).title}</h1>
    </main>
  );
}

/** Back and Forward over one tab that went from Home to Workflows to Support reply, above its page. */
function renderButtons(tabs = new TabSet()) {
  tabs.openHere(workflows);
  tabs.openHere(reply);
  const container = render(<HistoryButtons tabs={tabs} />);
  render(<Page tabs={tabs} />);
  return { tabs, container };
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

verifies("shell.title-bar", () => {
  describe("HistoryButtons", () => {
    it("goes Back and Forward in the active tab and follows it", () => {
      const { tabs, container } = renderButtons();
      click(button(container, "Back"));
      expect(currentLocation(tabs.active).title).toBe("Workflows");
      click(button(container, "Forward"));
      expect(currentLocation(tabs.active).title).toBe("Support reply");
    });

    it("moves focus to the new page's h1 after Back and after Forward (a11y A3)", () => {
      const { container } = renderButtons();
      const back = button(container, "Back");
      back.focus();
      click(back);
      expect(document.activeElement?.tagName).toBe("H1");
      expect(document.activeElement?.textContent).toBe("Workflows");

      button(container, "Forward").focus();
      click(button(container, "Forward"));
      expect(document.activeElement?.textContent).toBe("Support reply");
    });

    it("leaves focus on Back or Forward when there's nowhere to go", () => {
      const { container } = renderButtons();
      const forward = button(container, "Forward");
      forward.focus();
      click(forward);
      expect(document.activeElement).toBe(forward);
    });

    it("subscribes to the tab set once, not again on every render", () => {
      const tabs = new TabSet();
      let subscribed = 0;
      const subscribe = tabs.subscribe.bind(tabs);
      tabs.subscribe = (listener) => {
        subscribed += 1;
        return subscribe(listener);
      };
      const { container } = renderButtons(tabs);
      const before = subscribed;
      click(button(container, "Back"));
      click(button(container, "Forward"));
      expect(subscribed).toBe(before);
    });

    it("keeps Back and Forward in the Tab order when there's nowhere to go, and says why", () => {
      const { tabs, container } = renderButtons();
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

    it("has no Assistant button until the Assistant lands", () => {
      const { container } = renderButtons();
      const names = [...container.querySelectorAll("button")].map((b) => b.ariaLabel);
      expect(names).toEqual(["Back", "Forward"]);
      const sizes = [...container.querySelectorAll("button")].map((b) => b.className);
      expect(sizes.every((name) => name.includes("size-control-md"))).toBe(true);
    });
  });
});
