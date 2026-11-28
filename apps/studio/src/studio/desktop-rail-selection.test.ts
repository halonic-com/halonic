import { createShell, type FolderFacts, selectedRailEntry } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { desktopFeatures } from "./desktop-features.ts";

/** A folder for which every entry shows. */
const everyEntry: FolderFacts = {
  kind: "workspace-project",
  hasItems: true,
  hasCodeFolderInside: true,
  git: "repository",
  runsRecorded: true,
  waitingCount: 0,
};

const shell = createShell({ ...desktopFeatures, host: "desktop-app", platform: "windows" });
const entries = shell.contributions.rail.shown(everyEntry);
const placeOfKind = (kind: string) => shell.contributions.itemKinds.get(kind)?.place;

function entryFor(key: string) {
  return selectedRailEntry(entries, { key, title: key }, placeOfKind);
}

verifies("studio.desktop-rail-selection", () => {
  describe("places", () => {
    it.each([
      ["home", "home"],
      ["library", "library"],
      ["agents", "library"],
      ["workflows", "library"],
      ["routines", "library"],
      ["overview", "messenger"],
      ["team", "messenger"],
      ["inbox", "inbox"],
      ["runs", "runs"],
      ["changes", "changes"],
      ["pull-requests", "changes"],
    ])("puts %s in %s", (key, expected) => {
      expect(entryFor(key)).toBe(expected);
    });
  });

  describe("items", () => {
    it.each([
      ["agent/acme/sorter", "library"],
      ["workflow/acme/reply", "library"],
      ["routine/acme/nightly", "library"],
      ["skill/acme/summarise", "library"],
      ["knowledge/acme/handbook", "library"],
      ["collection/acme/invoices", "library"],
      ["connector/acme/mail", "library"],
      ["run/run-1", "runs"],
      ["run-file/run-1/out.txt", "runs"],
      ["file/workspace/src/index.ts", "code"],
    ])("puts %s in %s", (key, expected) => {
      expect(entryFor(key)).toBe(expected);
    });
  });

  it("puts the Search page in no entry", () => {
    expect(entryFor("search:invoices")).toBeUndefined();
  });

  it("opens only pages a desktop feature adds", () => {
    const places = new Set<string>(shell.contributions.places.list().map((place) => place.id));
    const opened = entries.flatMap((entry) => (entry.opens === undefined ? [] : [entry.opens]));
    expect(opened.length).toBeGreaterThan(0);
    for (const key of opened) expect(places).toContain(key);
  });
});
