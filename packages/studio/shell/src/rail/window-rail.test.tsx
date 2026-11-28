// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { defineFeature } from "../feature.ts";
import type { FolderFacts, FolderFactsSource, RailEntryContribution } from "../points/rail.ts";
import { searchPageLocation } from "../search/search-page-names.ts";
import { createShell } from "../shell.ts";
import { currentLocation, TabSet } from "../tabs/tab-set.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { placesOfOtherEntries, useWindowRailParts, workspaceProjectFacts } from "./window-rail.tsx";

afterEach(unmountAll);

/** A folder facts source the test changes by hand. */
class HandFacts implements FolderFactsSource {
  #listeners = new Set<() => void>();
  facts: FolderFacts;
  constructor(facts: FolderFacts) {
    this.facts = facts;
  }
  subscribe(listener: () => void) {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }
  set(facts: FolderFacts) {
    this.facts = facts;
    for (const listener of this.#listeners) listener();
  }
}

function entry(fields: Pick<RailEntryContribution, "id" | "holds" | "order">) {
  return {
    label: fields.id[0]?.toUpperCase() + fields.id.slice(1),
    icon: fields.id,
    opens: fields.id,
    shows: () => true,
    ...fields,
  } satisfies RailEntryContribution;
}

const rail = createShell({
  features: [
    defineFeature({
      id: "acme-places",
      title: "Acme places",
      register(studio) {
        studio.rail.add(entry({ id: "library", holds: ["library", "agents"], order: 20 }));
        studio.rail.add({
          ...entry({ id: "messenger", holds: ["team"], order: 30 }),
          opens: undefined,
        });
        studio.rail.add(entry({ id: "inbox", holds: ["inbox"], order: 40 }));
        studio.rail.add({
          ...entry({ id: "runs", holds: ["runs"], order: 50 }),
          shows: (facts) => facts.runsRecorded,
        });
      },
    }),
  ],
}).contributions.rail;

/** The sidebar's places in its order: `routines` is a place no entry holds. */
const places = ["home", "inbox", "agents", "routines", "library", "runs", "team"];

interface HarnessProps {
  readonly tabs: TabSet;
  readonly source?: FolderFactsSource;
  readonly onSettings: () => void;
}

function Harness({ tabs, source, onSettings }: HarnessProps) {
  const parts = useWindowRailParts({
    rail,
    source,
    tabs,
    placeOfKind: () => undefined,
    onSettings,
  });
  const listed = places.filter((place) => !parts.leftOut.has(place));
  return (
    <>
      {parts.element}
      <ul data-listed="">
        {listed.map((place) => (
          <li key={place}>{place}</li>
        ))}
      </ul>
    </>
  );
}

function renderWindowRail(source?: FolderFactsSource) {
  const tabs = new TabSet();
  const settingsOpened: string[] = [];
  const container = render(
    <Harness
      tabs={tabs}
      onSettings={() => settingsOpened.push("settings")}
      {...(source === undefined ? {} : { source })}
    />,
  );
  return {
    tabs,
    settingsOpened,
    shown: () =>
      [...container.querySelectorAll("nav li [aria-label]")].map((button) =>
        button.getAttribute("aria-label"),
      ),
    selected: () =>
      [...container.querySelectorAll('nav [aria-current="page"]')].map((button) =>
        button.getAttribute("aria-label"),
      ),
    listed: () =>
      [...container.querySelectorAll("[data-listed] li")].map((item) => item.textContent),
    click: (name: string) =>
      act(() => (container.querySelector(`nav [aria-label="${name}"]`) as HTMLElement).click()),
  };
}

verifies("shell.rail-frame", () => {
  describe("the list column", () => {
    it("lists the selected entry's places and those no entry holds", () => {
      const window = renderWindowRail();
      act(() => window.tabs.openHere({ key: "agents", title: "Agents" }));
      expect(window.selected()).toEqual(["Library"]);
      expect(window.listed()).toEqual(["agents", "routines", "library"]);
    });

    it("lists every place while no entry is selected", () => {
      const window = renderWindowRail();
      act(() => window.tabs.openHere(searchPageLocation("invoices")));
      expect(window.selected()).toEqual([]);
      expect(window.listed()).toEqual(places);
    });

    it("leaves out the places of an entry its rule hides", () => {
      const every = [
        { id: "runs", holds: ["runs"] },
        { id: "home", holds: ["home"] },
      ] as const;
      expect([...placesOfOtherEntries(every.map(asEntry), "home")]).toEqual(["runs"]);
    });
  });

  describe("a click", () => {
    it("selects an entry with no page, and keeps the tab, until the tab moves on", () => {
      const window = renderWindowRail();
      window.click("Messenger");
      expect(currentLocation(window.tabs.active).key).toBe("home");
      expect(window.selected()).toEqual(["Messenger"]);
      expect(window.listed()).toEqual(["routines", "team"]);
      act(() => window.tabs.openHere({ key: "inbox", title: "Inbox" }));
      expect(window.selected()).toEqual(["Inbox"]);
    });

    it("opens Settings from the rail's bottom, without selecting it or moving the tab", () => {
      const window = renderWindowRail();
      window.click("Settings");
      expect(window.settingsOpened).toEqual(["settings"]);
      expect(window.selected()).toEqual(["Home"]);
      expect(currentLocation(window.tabs.active).key).toBe("home");
    });

    it("selects an entry whose page it opens", () => {
      const window = renderWindowRail();
      window.click("Inbox");
      expect(window.selected()).toEqual(["Inbox"]);
      expect(window.listed()).toEqual(["inbox", "routines"]);
    });
  });

  describe("the folder facts", () => {
    it("shows a workspace project's entries when the app gives no facts", () => {
      expect(renderWindowRail().shown()).toEqual(["Home", "Library", "Messenger", "Inbox"]);
    });

    it("shows the entries the new facts show", () => {
      const source = new HandFacts(workspaceProjectFacts);
      const window = renderWindowRail(source);
      expect(window.shown()).not.toContain("Runs");
      act(() => source.set({ ...workspaceProjectFacts, runsRecorded: true }));
      expect(window.shown()).toContain("Runs");
    });

    it("keeps the entry the active tab is in while its rule no longer holds", () => {
      const source = new HandFacts({ ...workspaceProjectFacts, runsRecorded: true });
      const window = renderWindowRail(source);
      window.click("Runs");
      act(() => source.set(workspaceProjectFacts));
      expect(window.shown()).toContain("Runs");
      expect(window.selected()).toEqual(["Runs"]);
    });
  });
});

function asEntry(fields: { readonly id: "runs" | "home"; readonly holds: readonly string[] }) {
  return {
    ...fields,
    label: fields.id,
    icon: fields.id,
    order: 0,
    opens: undefined,
    shows: () => true,
  };
}
