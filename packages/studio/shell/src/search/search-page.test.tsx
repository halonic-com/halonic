// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it } from "vitest";
import { createAnnouncer } from "../announcer/announcer.ts";
import type { SearchProviderContribution, SearchResult } from "../points/commands.ts";
import type { Registered } from "../points/point-store.ts";
import { currentLocation, TabSet } from "../tabs/tab-set.ts";
import { installFakePopover } from "../test-support/fake-popover.ts";
import { FakeTimers } from "../test-support/fake-timers.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import type { WorkspaceContext } from "../workspace-context.ts";
import { SearchPage } from "./search-page.tsx";
import { searchPageLocation } from "./search-page-names.ts";

const refundChecker: SearchResult = {
  item: { kind: "agent", hub: "acme", id: "refund-checker" },
  label: "Refund checker",
  detail: "Agent · acme",
  description: "Checks refund requests against the policy.",
};
const mailTriage: SearchResult = {
  item: { kind: "agent", hub: "acme", id: "mail-triage" },
  label: "Mail triage",
  detail: "Agent · acme",
  description: "Sorts refund mail.",
};

let restorePopover: () => void;

beforeEach(() => {
  restorePopover = installFakePopover();
});

afterEach(() => {
  unmountAll();
  restorePopover();
});

/** A provider that answers with `results`, or fails when there are none. */
function provider(results: readonly SearchResult[]): Registered<SearchProviderContribution> {
  return {
    featureId: "agents",
    id: "agents",
    title: "Agents",
    order: 0,
    search: () =>
      results.length === 0 ? Promise.reject(new Error("down")) : Promise.resolve(results),
  };
}

async function renderPage(words: string, results: readonly SearchResult[]) {
  const tabs = new TabSet();
  tabs.openHere(searchPageLocation(words));
  const timers = new FakeTimers();
  const announcer = createAnnouncer({ timers });
  const said: string[] = [];
  announcer.mountRegions({
    polite: { say: (text) => said.push(text) },
    assertive: { say: (text) => said.push(text) },
  });
  const view = render(
    <SearchPage
      words={words}
      tabs={tabs}
      announcer={announcer}
      providers={[provider(results)]}
      contextFor={(featureId) => ({ featureId }) as unknown as WorkspaceContext}
      kinds={{ get: (kind) => (kind === "agent" ? { label: "Agent" } : undefined) }}
      notAnswering="The engine isn't answering. It may still be starting."
    />,
  );
  // Lets the provider's answer arrive.
  await act(async () => undefined);
  return {
    view,
    tabs,
    heard: () => {
      timers.advance(0);
      return said;
    },
    status: () => view.querySelector('[role="status"]')?.textContent,
    rows: () => [...view.querySelectorAll("li a")].map((row) => row.textContent),
    marks: () => [...view.querySelectorAll("mark")].map((mark) => mark.textContent),
    button: (name: string) => {
      const found = [...view.querySelectorAll("button")].find(
        (button) => (button.getAttribute("aria-label") ?? button.textContent) === name,
      );
      if (found === undefined) {
        throw new Error(`No button named ${name}`);
      }
      return found;
    },
    click: (element: Element, init: MouseEventInit = {}) =>
      act(() => {
        element.dispatchEvent(
          new MouseEvent("click", { bubbles: true, cancelable: true, ...init }),
        );
      }),
  };
}

verifies("shell.search-page", () => {
  it("draws the title, its sentence, the box and the chips, with no Pattern chip", async () => {
    const page = await renderPage("refund", [refundChecker]);
    expect(page.view.querySelector("h1")?.textContent).toBe("Search");
    expect(page.view.textContent).toContain(
      "Find anything in this workspace by its name or description.",
    );
    const box = page.view.querySelector<HTMLInputElement>(
      'search input[aria-label="Search words"]',
    );
    expect(box?.value).toBe("refund");
    const chips = [...page.view.querySelectorAll("fieldset > button")].map(
      (chip) => chip.getAttribute("aria-label") ?? chip.textContent,
    );
    expect(chips).toEqual(["In: Everything", "Hub: All hubs", "Match case", "Whole word"]);
    expect(page.view.textContent).not.toContain("Pattern");
    expect(page.view.textContent).not.toContain("Text inside");
  });

  it("lists names and descriptions with the words marked, under the count", async () => {
    const page = await renderPage("refund", [mailTriage, refundChecker]);
    expect(page.status()).toBe("2 matches in 2 items");
    expect(page.view.querySelector("h2")?.textContent).toBe("Names and descriptions");
    expect(page.rows()).toEqual([
      "Refund checkerAgent · acmeChecks refund requests against the policy.",
      "Mail triageAgent · acmeSorts refund mail.",
    ]);
    expect(page.marks()).toEqual(["Refund", "refund", "refund"]);
  });

  it("opens a result here, or in a new tab with a Ctrl-click", async () => {
    const page = await renderPage("refund", [refundChecker]);
    const row = page.view.querySelector("li a") as HTMLAnchorElement;
    page.click(row, { ctrlKey: true });
    expect(page.tabs.state.tabs).toHaveLength(2);
    expect(page.heard()).toContain("Opened Refund checker in a new tab.");
    page.click(row);
    const active = page.tabs.state.tabs.find((tab) => tab.id === page.tabs.state.activeId);
    expect(active && currentLocation(active).key).toBe("agent/acme/refund-checker");
  });

  it("searches new words as a new place in this tab, so Back goes to the old words", async () => {
    const page = await renderPage("refund", [refundChecker]);
    const box = page.view.querySelector("search input") as HTMLInputElement;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(
        box,
        "policy",
      );
      box.dispatchEvent(new Event("input", { bubbles: true }));
    });
    act(() => {
      box.form?.requestSubmit();
    });
    const titles = () => page.tabs.state.tabs.map((tab) => currentLocation(tab).title);
    expect(titles()).toEqual(["Search: policy"]);
    act(() => page.tabs.back());
    expect(titles()).toEqual(["Search: refund"]);
  });

  it("says nothing matches, and offers all hubs while a hub is picked", async () => {
    const desk: SearchResult = {
      item: { kind: "agent", hub: "beta", id: "desk" },
      label: "Refun desk",
    };
    const page = await renderPage("refun", [refundChecker, desk]);
    page.click(page.button("Hub: All hubs"));
    page.click(menuItem(page.view, "acme"));
    // Only "Refun desk" in beta has "refun" as a whole word.
    page.click(page.button("Whole word"));
    expect(page.view.textContent).toContain("Nothing matches “refun”");
    expect(page.view.textContent).toContain(
      "Search looks in the names and descriptions of everything in this workspace.",
    );
    page.click(page.button("Search all hubs"));
    expect(page.rows()).toEqual(["Refun desk"]);
    expect(document.activeElement).toBe(page.view.querySelector("search input"));
  });

  it("says it couldn't search, with the reason and Try again", async () => {
    const page = await renderPage("refund", []);
    expect(page.view.textContent).toContain("Couldn't search");
    expect(page.view.textContent).toContain(
      "The engine isn't answering. It may still be starting.",
    );
    expect(page.button("Try again")).toBeDefined();
  });

  it("clears the box and keeps the focus in it", async () => {
    const page = await renderPage("refund", [refundChecker]);
    page.click(page.button("Clear"));
    const box = page.view.querySelector("search input") as HTMLInputElement;
    expect(box.value).toBe("");
    expect(document.activeElement).toBe(box);
  });
});

function menuItem(view: HTMLElement, name: string): HTMLElement {
  const item = [...view.querySelectorAll<HTMLElement>('[role="menuitemradio"]')].find(
    (candidate) => candidate.textContent === name,
  );
  if (item === undefined) {
    throw new Error(`No menu item named ${name}`);
  }
  return item;
}
