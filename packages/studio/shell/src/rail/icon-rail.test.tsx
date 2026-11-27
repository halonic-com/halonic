// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { act, useCallback, useSyncExternalStore } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { createAnnouncer } from "../announcer/announcer.ts";
import type { Registered } from "../points/point-store.ts";
import { homeRailEntry, type RailEntry, settingsRailEntry } from "../points/rail.ts";
import { currentLocation, type TabLocation, TabSet } from "../tabs/tab-set.ts";
import { FakeTimers } from "../test-support/fake-timers.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { IconRail } from "./icon-rail.tsx";
import { selectedRailEntry } from "./rail-selection.ts";

afterEach(unmountAll);

function shown(entry: RailEntry): Registered<RailEntry> {
  return { ...entry, featureId: "test" };
}

const library = shown({
  id: "library",
  label: "Library",
  icon: "library",
  order: 20,
  holds: ["library", "agents", "agent"],
  opens: "library",
  shows: () => true,
});
const inbox = shown({
  id: "inbox",
  label: "Inbox",
  icon: "inbox",
  order: 40,
  holds: ["inbox"],
  opens: "inbox",
  shows: () => true,
});
const entries = [shown(homeRailEntry), library, inbox, shown(settingsRailEntry)];

const sorter: TabLocation = { key: "agent/acme/sorter", title: "Sorter", kind: "agent" };
const search: TabLocation = { key: "search", title: "Search" };

/** A page as the frame shows it: a `main` whose `h1` is the active tab's title. */
function Page({ tabs }: { readonly tabs: TabSet }) {
  useSyncExternalStore(
    useCallback((listener) => tabs.subscribe(listener), [tabs]),
    () => tabs.state,
  );
  return (
    <main>
      <h1 tabIndex={-1}>{currentLocation(tabs.active).title}</h1>
    </main>
  );
}

function renderRail(tabs = new TabSet()) {
  const announcer = createAnnouncer({ timers: new FakeTimers() });
  let settingsOpened = 0;
  const container = render(
    <>
      <IconRail
        entries={entries}
        tabs={tabs}
        announcer={announcer}
        onSettings={() => {
          settingsOpened += 1;
        }}
      />
      <Page tabs={tabs} />
    </>,
  );
  const button = (name: string) =>
    container.querySelector(`nav [aria-label="${name}"]`) as HTMLButtonElement;
  const selectedNames = () =>
    [...container.querySelectorAll('nav [aria-current="page"]')].map((element) =>
      element.getAttribute("aria-label"),
    );
  return { container, tabs, button, selectedNames, settingsOpened: () => settingsOpened };
}

verifies("shell.rail", () => {
  describe("selection", () => {
    it("picks the entry that holds the first part of the tab's key", () => {
      expect(selectedRailEntry(entries, sorter)).toBe("library");
      expect(selectedRailEntry(entries, { key: "agents", title: "Agents" })).toBe("library");
      expect(selectedRailEntry(entries, { key: "home", title: "Home" })).toBe("home");
    });

    it("picks no entry for a page none holds", () => {
      expect(selectedRailEntry(entries, search)).toBeUndefined();
    });

    it("follows the active tab, however it was opened", () => {
      const rail = renderRail();
      expect(rail.selectedNames()).toEqual(["Home"]);
      act(() => rail.tabs.openHere(sorter));
      expect(rail.selectedNames()).toEqual(["Library"]);
      act(() => rail.tabs.openHere(search));
      expect(rail.selectedNames()).toEqual([]);
    });
  });

  describe("clicks", () => {
    it("opens the entry's page in the active tab and focuses its heading", () => {
      const rail = renderRail();
      act(() => rail.button("Inbox").click());
      expect(currentLocation(rail.tabs.active).key).toBe("inbox");
      expect(rail.selectedNames()).toEqual(["Inbox"]);
      expect(document.activeElement?.textContent).toBe("Inbox");
    });

    it("opens Settings' dialog and never selects Settings", () => {
      const rail = renderRail();
      act(() => rail.button("Settings").click());
      expect(rail.settingsOpened()).toBe(1);
      expect(rail.selectedNames()).toEqual(["Home"]);
    });

    it("names the rail Places and keeps Settings last", () => {
      const rail = renderRail();
      const names = [...rail.container.querySelectorAll("nav [aria-label]")].map((element) =>
        element.getAttribute("aria-label"),
      );
      expect(rail.container.querySelector("nav")?.getAttribute("aria-label")).toBe("Places");
      expect(names).toEqual(["Home", "Library", "Inbox", "Settings"]);
    });
  });
});
