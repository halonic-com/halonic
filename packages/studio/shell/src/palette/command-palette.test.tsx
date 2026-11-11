// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { act, type ReactNode, useState } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createAnnouncer } from "../announcer/announcer.ts";
import type { SearchResult } from "../points/commands.ts";
import type { TabLocation } from "../tabs/tab-set.ts";
import { fakeShowModal } from "../test-support/fake-show-modal.ts";
import { FakeTimers } from "../test-support/fake-timers.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { CommandPalette } from "./command-palette.tsx";
import { type PaletteRow, paletteGroups } from "./palette-groups.ts";

const reply: TabLocation = { key: "workflow/acme/reply", title: "Support reply", kind: "workflow" };
const refundChecker: SearchResult = {
  item: { kind: "agent", hub: "acme", id: "refund-checker" },
  label: "Refund checker",
  detail: "Agent · acme",
};
const refundPolicy: SearchResult = {
  item: { kind: "knowledge", hub: "acme", id: "refund-policy" },
  label: "Refund policy",
  detail: "Knowledge · acme",
};
const notAnswering = "The engine isn't answering. It may still be starting.";

let restoreModal: () => void;

beforeEach(() => {
  restoreModal = fakeShowModal();
  vi.useFakeTimers();
});

afterEach(() => {
  unmountAll();
  restoreModal();
  vi.useRealTimers();
});

interface Shown {
  readonly words: string;
  readonly found?: readonly SearchResult[];
  readonly failed?: boolean;
  readonly searching?: boolean;
}

/** Draws what the test shows now; `bind` hands the test the way to show something else. */
function Showing({
  bind,
  draw,
}: {
  readonly bind: (show: (shown: Shown) => void) => void;
  readonly draw: (shown: Shown) => ReactNode;
}) {
  const [shown, setShown] = useState<Shown>({ words: "" });
  bind(setShown);
  return draw(shown);
}

/** The palette over Support reply's tab, re-rendered with `show` as words and results change. */
function renderPalette() {
  const timers = new FakeTimers();
  const announcer = createAnnouncer({ timers });
  const said: string[] = [];
  announcer.mountRegions({
    polite: { say: (text) => said.push(text) },
    assertive: { say: (text) => said.push(text) },
  });
  const opened: { label: string; inNewTab: boolean }[] = [];
  const typed: string[] = [];
  let retried = 0;
  let show: (shown: Shown) => void = () => undefined;
  const view = render(
    <Showing
      bind={(update) => {
        show = update;
      }}
      draw={(shown) => (
        <CommandPalette
          words={shown.words}
          onWordsChange={(words) => typed.push(words)}
          content={paletteGroups({
            words: shown.words,
            openTabs: [reply],
            recent: [],
            found: shown.found ?? [],
            searchFailed: shown.failed ?? false,
            actions: [{ id: "shell.new-tab", title: "New tab" }],
          })}
          searching={shown.searching ?? false}
          platform="windows"
          kinds={{ get: (kind) => (kind === "agent" ? { label: "Agent" } : undefined) }}
          notAnswering={notAnswering}
          announcer={announcer}
          onOpen={(row: PaletteRow, inNewTab) => opened.push({ label: row.label, inNewTab })}
          onTryAgain={() => {
            retried += 1;
          }}
          onCancel={() => undefined}
        />
      )}
    />,
  );

  const box = () => view.querySelector<HTMLInputElement>('[role="combobox"]') as HTMLInputElement;
  const activeName = () => {
    const id = box().getAttribute("aria-activedescendant");
    return id === null ? undefined : document.getElementById(id)?.getAttribute("aria-label");
  };
  const press = (key: string, held: KeyboardEventInit = {}) =>
    act(() => {
      box().dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, ...held }));
    });
  return {
    view,
    box,
    activeName,
    press,
    show: (shown: Shown) => act(() => show(shown)),
    heard: () => {
      timers.advance(0);
      return said;
    },
    opened,
    typed,
    retries: () => retried,
    rest: () => act(() => vi.advanceTimersByTime(500)),
  };
}

verifies("shell.palette-dialog", () => {
  it("is a box named Search whose search row is a combobox with focus", () => {
    const palette = renderPalette();
    expect(palette.view.querySelector("dialog")?.getAttribute("aria-label")).toBe("Search");
    expect(document.activeElement).toBe(palette.box());
    expect(palette.box().getAttribute("aria-controls")).toBe(
      palette.view.querySelector('[role="listbox"]')?.id,
    );
  });

  it("names each group by its title, and each option for a screen reader", () => {
    const palette = renderPalette();
    const group = palette.view.querySelector('[role="group"]') as HTMLElement;
    const title = document.getElementById(group.getAttribute("aria-labelledby") ?? "");
    expect(title?.textContent).toBe("Open tabs");
    expect(palette.activeName()).toBe("Support reply, workflow, switch to tab");
    expect(palette.view.textContent).toContain("Switch to tab");
  });

  it("moves the active option with ↓ and ↑ through every group, wrapping", () => {
    const palette = renderPalette();
    palette.show({ words: "re", found: [refundChecker, refundPolicy] });
    expect(palette.activeName()).toBe("Refund checker, agent");
    palette.press("ArrowUp");
    expect(palette.activeName()).toBe("Support reply, workflow, switch to tab");
    palette.press("ArrowDown");
    expect(palette.activeName()).toBe("Refund checker, agent");
  });

  it("opens the active option with Enter here and with Ctrl Enter in a new tab", () => {
    const palette = renderPalette();
    palette.show({ words: "refund", found: [refundChecker] });
    palette.press("Enter");
    palette.press("Enter", { ctrlKey: true });
    expect(palette.opened).toEqual([
      { label: "Refund checker", inNewTab: false },
      { label: "Refund checker", inNewTab: true },
    ]);
  });

  it("keeps the picked option when results for the same words arrive late", () => {
    const palette = renderPalette();
    palette.show({ words: "refund", found: [refundChecker], searching: true });
    palette.press("ArrowDown");
    palette.show({ words: "refund", found: [refundChecker, refundPolicy] });
    expect(palette.activeName()).toBe("Refund checker, agent");
    palette.press("ArrowDown");
    palette.show({ words: "refund p", found: [refundPolicy] });
    expect(palette.activeName()).toBe("Refund policy");
  });

  it("marks the typed words in a row's name", () => {
    const palette = renderPalette();
    palette.show({ words: "check", found: [refundChecker] });
    expect(palette.view.querySelector("mark")?.textContent).toBe("check");
  });

  it("selects the words with Ctrl K rather than closing", () => {
    const palette = renderPalette();
    palette.show({ words: "refund" });
    palette.press("k", { ctrlKey: true });
    expect(palette.view.querySelector("dialog")?.open).toBe(true);
    expect(palette.box().selectionEnd).toBe("refund".length);
  });

  it("says the count once the words rest for 500 ms and the providers have answered", () => {
    const palette = renderPalette();
    palette.show({ words: "refund", searching: true });
    palette.rest();
    expect(palette.heard()).toEqual([]);
    palette.show({ words: "refund", found: [refundChecker, refundPolicy] });
    act(() => vi.advanceTimersByTime(499));
    expect(palette.heard()).toEqual([]);
    act(() => vi.advanceTimersByTime(1));
    expect(palette.heard()).toEqual(["2 results"]);
  });

  it("shows two skeleton rows while the providers look", () => {
    const palette = renderPalette();
    palette.show({ words: "refund", searching: true });
    expect(palette.view.querySelector('[role="listbox"]')?.getAttribute("aria-busy")).toBe("true");
    expect(palette.view.textContent).not.toContain("Nothing matches");
  });

  it("says nothing matches the words, with the actions still listed", () => {
    const palette = renderPalette();
    palette.show({ words: "new" });
    expect(palette.view.textContent).toContain("Nothing matches “new”.");
    expect(palette.activeName()).toBe("New tab");
  });

  it("says it couldn't search with the reason and Try again", () => {
    const palette = renderPalette();
    palette.show({ words: "new", failed: true });
    expect(palette.view.textContent).toContain("Couldn't search");
    expect(palette.view.textContent).toContain(notAnswering);
    expect(palette.view.textContent).not.toContain("Nothing matches");
    const tryAgain = [...palette.view.querySelectorAll("button")].find(
      (button) => button.textContent === "Try again",
    );
    act(() => tryAgain?.click());
    expect(palette.retries()).toBe(1);
    palette.rest();
    expect(palette.heard()).toEqual(["Couldn't search, 1 result"]);
  });

  it("brings the focus back to the search row after Try again", () => {
    const palette = renderPalette();
    palette.show({ words: "new", failed: true });
    const tryAgain = [...palette.view.querySelectorAll("button")].find(
      (button) => button.textContent === "Try again",
    );
    act(() => {
      tryAgain?.focus();
      tryAgain?.click();
    });
    // The retry clears the failure, which removes the focused button from the page.
    palette.show({ words: "new", searching: true });
    expect(document.activeElement).toBe(palette.box());
  });

  it("opens a clicked row, in a new tab with Ctrl, and keeps the focus in the box", () => {
    const palette = renderPalette();
    palette.show({ words: "refund", found: [refundChecker] });
    const row = palette.view.querySelector('[role="option"]') as HTMLElement;
    const pressed = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
    act(() => row.dispatchEvent(pressed));
    expect(pressed.defaultPrevented).toBe(true);
    act(() => row.dispatchEvent(new MouseEvent("click", { bubbles: true, ctrlKey: true })));
    expect(palette.opened).toEqual([{ label: "Refund checker", inNewTab: true }]);
  });

  it("passes typed words up", () => {
    const palette = renderPalette();
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    act(() => {
      setValue?.call(palette.box(), "ref");
      palette.box().dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(palette.typed).toEqual(["ref"]);
  });
});
