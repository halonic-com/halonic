// @vitest-environment jsdom

import { createToastStore, type ToastStore } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it } from "vitest";
import type { StudioHost } from "../engine/engine-words.ts";
import type { KeyboardPlatform } from "../points/keybindings.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { currentLocation, type TabLocation, TabSet, type WindowTab } from "./tab-set.ts";
import { useWindowKeys } from "./use-window-keys.ts";
import { type PressedKey, windowKeyFor } from "./window-keys.ts";

const agents: TabLocation = { key: "agents", title: "Agents" };
const sorter: TabLocation = { key: "agent/acme/sorter", title: "Sorter", kind: "agent" };
const supportReply: TabLocation = {
  key: "workflow/acme/support-reply",
  title: "Support reply",
  kind: "workflow",
};

afterEach(unmountAll);

/** Tabs on the given places, in order, with the last one active. */
function tabsOn(...places: TabLocation[]): TabSet {
  const tabs = new TabSet();
  const [first, ...rest] = places;
  if (first !== undefined) {
    tabs.openHere(first);
  }
  for (const place of rest) {
    tabs.activate(tabs.openInNewTab(place).tab.id);
  }
  return tabs;
}

function activeTitle(tabs: TabSet): string {
  const active = tabs.state.tabs.find((tab) => tab.id === tabs.state.activeId);
  return active === undefined ? "" : currentLocation(active).title;
}

function titles(tabs: TabSet): string[] {
  return tabs.state.tabs.map((tab) => currentLocation(tab).title);
}

interface Setup {
  readonly host?: StudioHost;
  readonly platform?: KeyboardPlatform;
  readonly toasts?: ToastStore;
  readonly onNewTab?: (tab: WindowTab) => void;
  readonly page?: React.ReactNode;
}

function bindKeys(tabs: TabSet, setup: Setup = {}): void {
  function Window() {
    useWindowKeys({
      host: setup.host ?? "desktop-app",
      platform: setup.platform ?? "windows",
      tabs,
      toasts: setup.toasts ?? createToastStore(),
      onNewTab: setup.onNewTab,
    });
    return <>{setup.page}</>;
  }
  render(<Window />);
}

/** Presses keys such as `Ctrl+Shift+T` on the focused element, and returns the event. */
function press(keys: string, target: Element = document.body): KeyboardEvent {
  const parts = keys.split("+");
  const key = parts[parts.length - 1] ?? "";
  const event = new KeyboardEvent("keydown", {
    key,
    code: /^\d$/.test(key) ? `Digit${key}` : "",
    ctrlKey: parts.includes("Ctrl"),
    metaKey: parts.includes("Cmd"),
    shiftKey: parts.includes("Shift"),
    altKey: parts.includes("Alt"),
    bubbles: true,
    cancelable: true,
  });
  act(() => {
    target.dispatchEvent(event);
  });
  return event;
}

function pressed(fields: Partial<PressedKey>): PressedKey {
  return {
    key: "",
    code: "",
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    altKey: false,
    ...fields,
  };
}

verifies("shell.window-keys", () => {
  it("closes the active tab with Ctrl W and brings it back with Ctrl Shift T", () => {
    const tabs = tabsOn(agents, sorter);
    bindKeys(tabs);

    const closing = press("Ctrl+w");
    expect(titles(tabs)).toEqual(["Agents"]);
    expect(closing.defaultPrevented).toBe(true);

    press("Ctrl+Shift+T");
    expect(titles(tabs)).toEqual(["Agents", "Sorter"]);
    expect(activeTitle(tabs)).toBe("Sorter");
  });

  it("opens a new tab on Home with Cmd T on macOS, tells the frame, and ignores Ctrl T", () => {
    const tabs = tabsOn(agents, sorter);
    const opened: string[] = [];
    bindKeys(tabs, {
      platform: "macos",
      onNewTab: (tab) => opened.push(currentLocation(tab).title),
    });

    press("Cmd+t");
    expect(titles(tabs)).toEqual(["Agents", "Sorter", "Home"]);
    expect(activeTitle(tabs)).toBe("Home");
    expect(opened).toEqual(["Home"]);

    const ctrlT = press("Ctrl+t");
    expect(titles(tabs)).toHaveLength(3);
    expect(ctrlT.defaultPrevented).toBe(false);
  });

  it("goes to a tab by its position with Ctrl 1–9, and cycles with Ctrl Tab", () => {
    const tabs = tabsOn(agents, sorter, supportReply);
    tabs.activateAt(0);
    bindKeys(tabs);

    press("Ctrl+9");
    expect(activeTitle(tabs)).toBe("Support reply");
    press("Ctrl+1");
    expect(activeTitle(tabs)).toBe("Agents");
    press("Ctrl+Shift+Tab");
    expect(activeTitle(tabs)).toBe("Support reply");
    press("Ctrl+Tab");
    expect(activeTitle(tabs)).toBe("Agents");
    press("Ctrl+2");
    expect(activeTitle(tabs)).toBe("Sorter");
  });

  it("keeps Ctrl Tab on Ctrl on macOS", () => {
    expect(windowKeyFor(pressed({ key: "Tab", ctrlKey: true }), "macos")).toEqual({
      kind: "cycle-tabs",
      step: 1,
    });
    expect(windowKeyFor(pressed({ key: "Tab", metaKey: true }), "macos")).toBeUndefined();
  });

  it("reads a digit by its place on the keyboard", () => {
    // On AZERTY, the key under 1 types "&" without Shift.
    expect(windowKeyFor(pressed({ key: "&", code: "Digit1", ctrlKey: true }), "linux")).toEqual({
      kind: "activate-tab",
      index: 0,
    });
  });

  it("does nothing with Alt, with both Ctrl and Cmd, or with Shift on W or a digit", () => {
    for (const fields of [
      { key: "w", ctrlKey: true, altKey: true },
      { key: "w", ctrlKey: true, metaKey: true },
      { key: "W", ctrlKey: true, shiftKey: true },
      { key: "!", code: "Digit1", ctrlKey: true, shiftKey: true },
      { key: "F6", shiftKey: true },
      { key: "q", ctrlKey: true },
    ]) {
      expect(windowKeyFor(pressed(fields), "windows")).toBeUndefined();
    }
  });

  it("moves the focus to the toasts with F6", () => {
    const toasts = createToastStore();
    let focused = 0;
    toasts.bindFocus(() => {
      focused += 1;
    });
    bindKeys(tabsOn(agents), { toasts });

    press("F6");
    expect(focused).toBe(1);
  });

  it("binds nothing in served Studio or in the Android app", () => {
    for (const host of ["served", "phone"] as const) {
      const tabs = tabsOn(agents, sorter);
      bindKeys(tabs, { host });

      const closing = press("Ctrl+w");
      expect(titles(tabs)).toEqual(["Agents", "Sorter"]);
      expect(closing.defaultPrevented).toBe(false);
      unmountAll();
    }
  });

  it("leaves the keys alone while a modal dialog is open", () => {
    const tabs = tabsOn(agents, sorter);
    bindKeys(tabs, { page: <dialog open>Delete agent?</dialog> });

    press("Ctrl+w");
    expect(titles(tabs)).toEqual(["Agents", "Sorter"]);
  });

  it("leaves a key the page has already handled", () => {
    const tabs = tabsOn(agents, sorter);
    bindKeys(tabs, {
      page: (
        // biome-ignore lint/a11y/noStaticElementInteractions: a stand-in for an editor that handles its own keys
        <div data-testid="editor" onKeyDown={(event) => event.preventDefault()}>
          <input aria-label="Text" />
        </div>
      ),
    });

    press("Ctrl+w", document.querySelector("input") as HTMLElement);
    expect(titles(tabs)).toEqual(["Agents", "Sorter"]);
  });

  it("leaves a key alone while an input method composes", () => {
    const tabs = tabsOn(agents, sorter);
    bindKeys(tabs);

    const event = new KeyboardEvent("keydown", {
      key: "w",
      ctrlKey: true,
      isComposing: true,
      bubbles: true,
      cancelable: true,
    });
    act(() => {
      document.body.dispatchEvent(event);
    });
    expect(titles(tabs)).toEqual(["Agents", "Sorter"]);
  });
});
