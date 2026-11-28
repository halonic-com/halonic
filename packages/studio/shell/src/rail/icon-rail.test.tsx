// @vitest-environment jsdom

import { DashedRingIcon } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { act, useCallback, useSyncExternalStore } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { defineFeature } from "../feature.ts";
import type { Registered } from "../points/point-store.ts";
import {
  homeRailEntry,
  type RailEntry,
  type RailEntryContribution,
  settingsRailEntry,
} from "../points/rail.ts";
import { searchPageLocation } from "../search/search-page-names.ts";
import { createShell } from "../shell.ts";
import { ShellError } from "../shell-error.ts";
import { currentLocation, type TabLocation, TabSet } from "../tabs/tab-set.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { IconRail } from "./icon-rail.tsx";
import { type PlaceOfKind, selectedRailEntry } from "./rail-selection.ts";

afterEach(unmountAll);

const load = async () => ({ View: () => "view" });

function entry(fields: Partial<RailEntry> & Pick<RailEntry, "id" | "holds">): RailEntry {
  return {
    label: fields.id,
    icon: fields.id,
    order: 10,
    opens: fields.id,
    shows: () => true,
    ...fields,
  };
}

function shown(railEntry: RailEntry): Registered<RailEntry> {
  return { ...railEntry, featureId: "test" };
}

const library = entry({
  id: "library",
  label: "Library",
  holds: ["library", "agents", "workflows"],
});
const messenger = entry({ id: "messenger", label: "Messenger", holds: ["team"], opens: undefined });
const inbox = entry({ id: "inbox", label: "Inbox", holds: ["inbox"] });
// Settings first, so the tests show the rail puts it at the bottom.
const entries = [settingsRailEntry, homeRailEntry, library, messenger, inbox].map(shown);

/** The kinds the tests know: an agent is in Agents, and a made-up kind in Workflows. */
const kindPlaces: Readonly<Record<string, string>> = { agent: "agents", persona: "workflows" };
const placeOfKind: PlaceOfKind = (kind) => kindPlaces[kind];

const sorter: TabLocation = { key: "agent/acme/sorter", title: "Sorter", kind: "agent" };
const search: TabLocation = searchPageLocation("invoices");

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
  let settingsOpened = 0;
  const container = render(
    <>
      <IconRail
        entries={entries}
        tabs={tabs}
        placeOfKind={placeOfKind}
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
  const here = () => currentLocation(tabs.active).key;
  return { container, tabs, button, selectedNames, here, settingsOpened: () => settingsOpened };
}

verifies("shell.rail", () => {
  describe("selection", () => {
    it("puts an item in the place its kind registers", () => {
      expect(selectedRailEntry(entries, sorter, placeOfKind)).toBe("library");
      expect(selectedRailEntry(entries, { key: "agents", title: "Agents" }, placeOfKind)).toBe(
        "library",
      );
      expect(selectedRailEntry(entries, { key: "home", title: "Home" }, placeOfKind)).toBe("home");
    });

    it("selects the entry for a new kind's items without the entry changing", () => {
      const persona: TabLocation = { key: "persona/acme/clerk", title: "Clerk" };
      expect(selectedRailEntry(entries, persona, placeOfKind)).toBe("library");
    });

    it("picks no entry for a page none holds", () => {
      expect(selectedRailEntry(entries, search, placeOfKind)).toBeUndefined();
    });

    it("follows the active tab through opens, tab switches and Back", () => {
      const rail = renderRail();
      expect(rail.selectedNames()).toEqual(["Home"]);
      act(() => rail.tabs.openHere(sorter));
      expect(rail.selectedNames()).toEqual(["Library"]);
      act(() => rail.tabs.openHere(search));
      expect(rail.selectedNames()).toEqual([]);
      act(() => {
        rail.tabs.back();
      });
      expect(rail.selectedNames()).toEqual(["Library"]);
      const { tab } = rail.tabs.openInNewTab({ key: "inbox", title: "Inbox" });
      act(() => rail.tabs.activate(tab.id));
      expect(rail.selectedNames()).toEqual(["Inbox"]);
    });
  });

  describe("clicks", () => {
    it("opens the entry's page in the active tab and focuses its heading", () => {
      const rail = renderRail();
      act(() => rail.button("Inbox").click());
      expect(rail.here()).toBe("inbox");
      expect(rail.selectedNames()).toEqual(["Inbox"]);
      expect(document.activeElement?.textContent).toBe("Inbox");
    });

    it("leaves the tab on an item when its entry is clicked", () => {
      const rail = renderRail();
      act(() => rail.tabs.openHere(sorter));
      act(() => rail.button("Library").click());
      expect(rail.here()).toBe(sorter.key);
    });

    it("leaves the tab as it is for an entry with no page yet", () => {
      const rail = renderRail();
      act(() => rail.button("Messenger").click());
      expect(rail.here()).toBe("home");
      expect(rail.selectedNames()).toEqual(["Home"]);
    });

    it("opens Settings' dialog and never selects Settings", () => {
      const rail = renderRail();
      act(() => rail.button("Settings").click());
      expect(rail.settingsOpened()).toBe(1);
      expect(rail.selectedNames()).toEqual(["Home"]);
    });
  });

  describe("drawing", () => {
    it("names the rail Apps and puts Settings last", () => {
      const rail = renderRail();
      const names = [...rail.container.querySelectorAll("nav [aria-label]")].map((element) =>
        element.getAttribute("aria-label"),
      );
      expect(rail.container.querySelector("nav")?.getAttribute("aria-label")).toBe("Apps");
      expect(names).toEqual(["Home", "Library", "Messenger", "Inbox", "Settings"]);
    });

    it("shows the dashed ring for an icon the kit doesn't draw", () => {
      const ring = render(<DashedRingIcon />).querySelector("svg")?.outerHTML;
      const rail = renderRail();
      const drawn = (name: string) => rail.button(name).querySelector("svg")?.outerHTML;
      expect(ring).toBeDefined();
      expect(drawn("Messenger")).toBe(ring);
      expect(drawn("Inbox")).not.toBe(ring);
    });
  });

  describe("held keys", () => {
    function adding(...added: RailEntryContribution[]) {
      return () =>
        createShell({
          features: added.map((railEntry, index) =>
            defineFeature({
              id: `feature-${index}`,
              title: "Feature",
              register: (studio) => studio.rail.add(railEntry),
            }),
          ),
        });
    }

    it("rejects two entries that hold the same place, naming both", () => {
      const first = entry({ id: "inbox", holds: ["inbox"] }) as RailEntryContribution;
      const second = entry({ id: "runs", holds: ["runs", "inbox"] }) as RailEntryContribution;
      expect(adding(first, second)).toThrow(ShellError);
      expect(adding(first, second)).toThrow(/holds "inbox" in the entry "runs".*"feature-0"/);
    });

    it("rejects an entry holding a kind whose place another entry holds", () => {
      const kinds = defineFeature({
        id: "kinds",
        title: "Kinds",
        register: (studio) =>
          studio.itemKinds.add({
            kind: "note",
            label: "Note",
            icon: "note",
            place: "inbox",
            open: { view: "View", load },
          }),
      });
      const inboxEntry = entry({ id: "inbox", holds: ["inbox"] }) as RailEntryContribution;
      const runsEntry = entry({ id: "runs", holds: ["runs", "note"] }) as RailEntryContribution;
      const create = () =>
        createShell({
          features: [
            kinds,
            defineFeature({
              id: "a",
              title: "A",
              register: (studio) => studio.rail.add(inboxEntry),
            }),
            defineFeature({
              id: "b",
              title: "B",
              register: (studio) => studio.rail.add(runsEntry),
            }),
          ],
        });
      expect(create).toThrow(/"runs" holds the kind "note", whose place "inbox" the entry "inbox"/);
    });

    it("rejects an entry that holds Home's place", () => {
      const greedy = entry({ id: "inbox", holds: ["home"] }) as RailEntryContribution;
      expect(adding(greedy)).toThrow(/holds "home".*the shell already holds in "home"/);
    });
  });
});
