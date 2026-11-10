// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { act, useCallback, useSyncExternalStore } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { createAnnouncer } from "../announcer/announcer.ts";
import { showPlace } from "../points/frame.ts";
import { currentLocation, type TabLocation, TabSet } from "../tabs/tab-set.ts";
import { FakeTimers } from "../test-support/fake-timers.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { PlacesList } from "./places-list.tsx";

afterEach(unmountAll);

const workflows: TabLocation = { key: "workflows", title: "Workflows" };
const reply: TabLocation = { key: "workflow/acme/reply", title: "Support reply", kind: "workflow" };

const places = [
  showPlace("home", undefined),
  showPlace("inbox", { mark: "count", value: 2, spoken: "2 waiting" }),
  showPlace("workflows", undefined),
  showPlace("runs", { mark: "running", value: 1, spoken: "1 running" }),
];

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

function renderPlaces(tabs = new TabSet()) {
  const timers = new FakeTimers();
  const announcer = createAnnouncer({ timers });
  const said: string[] = [];
  announcer.mountRegions({
    polite: { say: (text) => said.push(text) },
    assertive: { say: (text) => said.push(text) },
  });
  const container = render(
    <>
      <PlacesList
        places={places}
        tabs={tabs}
        announcer={announcer}
        parentsOf={(location) => (location.key === reply.key ? [workflows] : [])}
      />
      <Page tabs={tabs} />
    </>,
  );
  const link = (name: string) =>
    [...container.querySelectorAll("nav a")].find((a) =>
      a.textContent?.startsWith(name),
    ) as HTMLAnchorElement;
  /** What was read out once the announcer's flush has run. */
  const announced = () => {
    timers.advance(0);
    return said;
  };
  return { tabs, container, link, announced };
}

function click(element: Element, init: MouseEventInit = {}) {
  act(() => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, ...init }));
  });
}

verifies("shell.sidebar-places", () => {
  describe("PlacesList", () => {
    it("is a nav named Places, with one link per added place in the sidebar's order", () => {
      const { container } = renderPlaces();
      const nav = container.querySelector("nav");
      expect(nav?.getAttribute("aria-label")).toBe("Places");
      expect([...container.querySelectorAll("nav li")].map((li) => li.textContent)).toEqual([
        "Home",
        "Inbox2, 2 waiting",
        "Workflows",
        "Runs, 1 running",
      ]);
    });

    it("shows where you are with the filled icon, and the others with the outline", () => {
      const { link } = renderPlaces();
      expect(link("Home").getAttribute("aria-current")).toBe("page");
      expect(link("Home").querySelector("[data-place-icon]")?.getAttribute("data-place-icon")).toBe(
        "home-filled",
      );
      expect(link("Inbox").hasAttribute("aria-current")).toBe(false);
      expect(
        link("Inbox").querySelector("[data-place-icon]")?.getAttribute("data-place-icon"),
      ).toBe("inbox");
    });

    it("counts an item as in its place: on a workflow, you are in Workflows", () => {
      const tabs = new TabSet();
      tabs.openHere(reply);
      const { link } = renderPlaces(tabs);
      expect(link("Workflows").getAttribute("aria-current")).toBe("page");
      expect(link("Home").hasAttribute("aria-current")).toBe(false);
    });

    it("opens a place in the active tab on a click and moves focus to the page's h1", () => {
      const { tabs, link } = renderPlaces();
      click(link("Workflows"));
      expect(tabs.state.tabs).toHaveLength(1);
      expect(currentLocation(tabs.active)).toEqual(workflows);
      expect(document.activeElement?.tagName).toBe("H1");
      expect(document.activeElement?.textContent).toBe("Workflows");
      expect(link("Workflows").getAttribute("aria-current")).toBe("page");
    });

    it("opens a place in a new tab on a Ctrl-click, stays put and says so", () => {
      const { tabs, link, announced } = renderPlaces();
      const before = tabs.active.id;
      click(link("Inbox"), { ctrlKey: true });
      expect(tabs.state.tabs).toHaveLength(2);
      expect(tabs.active.id).toBe(before);
      expect(announced()).toEqual(["Opened Inbox in a new tab."]);
      expect(document.activeElement?.tagName).not.toBe("H1");
    });
  });
});
