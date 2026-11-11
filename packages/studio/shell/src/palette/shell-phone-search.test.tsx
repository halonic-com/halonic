// @vitest-environment jsdom

import { createToastStore } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createAnnouncer } from "../announcer/announcer.ts";
import type {
  CommandContribution,
  SearchProviderContribution,
  SearchResult,
} from "../points/commands.ts";
import type { Registered } from "../points/point-store.ts";
import { type TabLocation, TabSet } from "../tabs/tab-set.ts";
import { fakeShowModal } from "../test-support/fake-show-modal.ts";
import { FakeTimers } from "../test-support/fake-timers.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import type { WorkspaceContext } from "../workspace-context.ts";
import { RecentPlaces } from "./recent-places.ts";
import { ShellPhoneSearch } from "./shell-phone-search.tsx";

const runs: TabLocation = { key: "runs", title: "Runs" };
const refundChecker: SearchResult = {
  item: { kind: "agent", hub: "acme", id: "refund-checker" },
  label: "Refund checker",
  detail: "Agent · acme",
};
const refundPolicy: SearchResult = {
  item: { kind: "knowledge", hub: "acme", id: "refund-policy" },
  label: "Refund policy",
};
const newAgent: Registered<CommandContribution> = {
  featureId: "agents",
  id: "new-agent",
  title: "New agent",
  run: () => undefined,
};
const notAnswering = "Halonic on your computer isn't answering.";

let restoreModal: () => void;

beforeEach(() => {
  restoreModal = fakeShowModal();
});

afterEach(() => {
  unmountAll();
  restoreModal();
  vi.useRealTimers();
});

/** A provider whose answers the test gives, one question at a time; no results for "fail" fail. */
function heldProvider() {
  const questions: { words: string; answer: (results: readonly SearchResult[]) => void }[] = [];
  const provider: Registered<SearchProviderContribution> = {
    featureId: "agents",
    id: "agents",
    title: "Agents",
    order: 0,
    search: (words) =>
      new Promise((resolve, reject) => {
        questions.push({
          words,
          answer: (results) =>
            results.length === 0 && words === "fail" ? reject(new Error("down")) : resolve(results),
        });
      }),
  };
  return { provider, questions };
}

/** The sheet over a phone that showed Runs last; it stays mounted until `onClose`. */
function renderSheet({
  commands = [],
}: {
  commands?: readonly Registered<CommandContribution>[];
} = {}) {
  const tabs = new TabSet();
  const recent = new RecentPlaces(tabs);
  tabs.openHere(runs);
  const timers = new FakeTimers();
  const announcer = createAnnouncer({ timers });
  const said: string[] = [];
  announcer.mountRegions({
    polite: { say: (text) => said.push(text) },
    assertive: { say: (text) => said.push(text) },
  });
  const held = heldProvider();
  const opened: TabLocation[] = [];
  const events: string[] = [];
  const view = render(
    <ShellPhoneSearch
      recent={recent}
      providers={[held.provider]}
      commands={commands}
      kinds={{ get: (kind) => (kind === "agent" ? { label: "Agent" } : undefined) }}
      contextFor={(featureId) => ({ featureId }) as unknown as WorkspaceContext}
      announcer={announcer}
      toasts={createToastStore()}
      notAnswering={notAnswering}
      platform="linux"
      onOpenLocation={(location) => {
        events.push(`open ${location.title}`);
        opened.push(location);
      }}
      onClose={() => events.push("close")}
    />,
  );
  const field = () => view.querySelector<HTMLInputElement>('[role="combobox"]');
  return {
    view,
    field,
    opened,
    events,
    type: (words: string) =>
      act(() => {
        const box = field() as HTMLInputElement;
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(box, words);
        box.dispatchEvent(new Event("input", { bubbles: true }));
      }),
    press: (key: string) =>
      act(() => {
        field()?.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
      }),
    answer: async (index: number, results: readonly SearchResult[]) => {
      await act(async () => {
        held.questions[index]?.answer(results);
      });
    },
    rows: () => [...view.querySelectorAll<HTMLElement>('[role="option"]')],
    rowNames: () =>
      [...view.querySelectorAll('[role="option"]')].map((row) => row.getAttribute("aria-label")),
    text: () => view.textContent ?? "",
    heard: () => {
      timers.advance(0);
      return said;
    },
  };
}

verifies("shell.phone-search", () => {
  it("opens as a sheet titled Search with Close, the focus in the field and Recent only", () => {
    const sheet = renderSheet();
    expect(sheet.view.querySelector("dialog h2")?.textContent).toBe("Search");
    expect(sheet.view.querySelector('button[aria-label="Close"]')).not.toBeNull();
    expect(document.activeElement).toBe(sheet.field());
    expect(sheet.field()?.getAttribute("enterkeyhint")).toBe("search");
    expect(sheet.text()).not.toContain("Open tabs");
    expect(sheet.rowNames()).toEqual(["Runs", "Home"]);
  });

  it("shows a found item's kind line under its name, and no Switch to tab", async () => {
    const sheet = renderSheet();
    sheet.type("refund");
    await sheet.answer(0, [refundChecker, refundPolicy]);
    const [checker, policy] = sheet.rows();
    expect(checker?.textContent).toBe("Refund checkerAgent · acme");
    expect(checker?.className).toContain("min-h-14");
    expect(policy?.className).toContain("min-h-touch");
    expect(sheet.text()).not.toContain("Switch to tab");
  });

  it("opens the first row on Enter, after closing the sheet", async () => {
    const sheet = renderSheet();
    sheet.type("refund");
    await sheet.answer(0, [refundChecker]);
    sheet.press("Enter");
    expect(sheet.events).toEqual(["close", "open Refund checker"]);
    expect(sheet.opened[0]).toEqual({
      key: "agent/acme/refund-checker",
      title: "Refund checker",
      kind: "agent",
    });
  });

  it("opens a tapped row", () => {
    const sheet = renderSheet();
    act(() => sheet.rows()[1]?.click());
    expect(sheet.events).toEqual(["close", "open Home"]);
  });

  it("shows the active row's bar only once an external keyboard's arrow moved it", () => {
    const sheet = renderSheet();
    expect(sheet.rows().map((row) => row.getAttribute("aria-selected"))).toEqual([
      "false",
      "false",
    ]);
    expect(sheet.field()?.hasAttribute("aria-activedescendant")).toBe(false);
    sheet.press("ArrowDown");
    const second = sheet.rows()[1];
    expect(second?.getAttribute("aria-selected")).toBe("true");
    expect(sheet.field()?.getAttribute("aria-activedescendant")).toBe(second?.id);
    sheet.press("Enter");
    expect(sheet.events).toEqual(["close", "open Home"]);
  });

  it("says Searching in a status under two skeleton rows while the providers look", async () => {
    const sheet = renderSheet();
    const status = () => sheet.view.querySelector('[role="status"]');
    expect(status()?.textContent).toBe("");
    sheet.type("refund");
    expect(sheet.view.querySelector('[role="listbox"]')?.getAttribute("aria-busy")).toBe("true");
    expect(status()?.textContent).toBe("Searching");
    await sheet.answer(0, []);
    expect(status()?.textContent).toBe("");
  });

  it("says Nothing matches with no Enter hint, then the actions that fit", async () => {
    const sheet = renderSheet({ commands: [newAgent] });
    sheet.type("new");
    await sheet.answer(0, []);
    expect(sheet.text()).toContain("Nothing matches “new”.");
    expect(sheet.text()).not.toContain("Press Enter");
    expect(sheet.rowNames()).toEqual(["New agent"]);
  });

  it("says Couldn't search with the reason and Try again, which asks again", async () => {
    const sheet = renderSheet();
    sheet.type("fail");
    await sheet.answer(0, []);
    expect(sheet.text()).toContain(`Couldn't search${notAnswering}Try again`);
    expect(sheet.field()?.value).toBe("fail");
    const tryAgain = [...sheet.view.querySelectorAll("button")].find(
      (button) => button.textContent === "Try again",
    );
    act(() => tryAgain?.click());
    expect(document.activeElement).toBe(sheet.field());
    await sheet.answer(1, [{ ...refundChecker, label: "Failed refunds" }]);
    expect(sheet.rowNames()).toEqual(["Failed refunds, agent"]);
  });

  it("runs an action with its feature's context after closing", async () => {
    const run = vi.fn();
    const sheet = renderSheet({ commands: [{ ...newAgent, run }] });
    sheet.type("new");
    await sheet.answer(0, []);
    await act(async () => sheet.rows()[0]?.click());
    expect(sheet.events).toEqual(["close"]);
    expect(run).toHaveBeenCalledExactlyOnceWith({ featureId: "agents" });
  });

  it("clears the field with its clear button and keeps the focus there", () => {
    const sheet = renderSheet();
    sheet.type("refund");
    act(() => sheet.view.querySelector<HTMLButtonElement>('button[aria-label="Clear"]')?.click());
    expect(sheet.field()?.value).toBe("");
    expect(document.activeElement).toBe(sheet.field());
  });

  it("closes on Close and on Android back, the dialog's cancel", () => {
    const sheet = renderSheet();
    act(() => sheet.view.querySelector<HTMLButtonElement>('button[aria-label="Close"]')?.click());
    act(() => {
      sheet.view.querySelector("dialog")?.dispatchEvent(new Event("cancel", { cancelable: true }));
    });
    expect(sheet.events).toEqual(["close", "close"]);
  });

  it("says the count once typing has stopped for 500 ms", async () => {
    vi.useFakeTimers();
    const sheet = renderSheet();
    sheet.type("refund");
    await sheet.answer(0, [refundChecker, refundPolicy]);
    act(() => vi.advanceTimersByTime(500));
    expect(sheet.heard()).toContain("2 results");
  });
});
