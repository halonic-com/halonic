import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import type { TabLocation } from "../tabs/tab-set.ts";
import {
  currentPhonePage,
  goBackOnPhone,
  isAtPlaceTop,
  openPhonePage,
  openPhonePageIn,
  type PlaceStacks,
  phonePlaceOf,
  settingsLocation,
  showsBottomNavigation,
  startPlaceStacks,
  switchPhonePlace,
} from "./place-stacks.ts";

const card: TabLocation = { key: "inbox/card/7", title: "Send the reply?" };
const run: TabLocation = { key: "run/43", title: "Run #43", kind: "run" };
const workflows: TabLocation = { key: "workflows", title: "Workflows" };
const workflow: TabLocation = { key: "workflow/support-reply", title: "Support reply" };

function shown(stacks: PlaceStacks): string {
  return currentPhonePage(stacks).location.key;
}

function on(place: "inbox" | "runs" | "more", ...pages: TabLocation[]): PlaceStacks {
  const there = switchPhonePlace(startPlaceStacks(), place);
  return pages.reduce((stacks, page) => openPhonePage(stacks, page), there);
}

verifies("shell.place-stacks", () => {
  describe("places", () => {
    it("starts on Home with every place at its top", () => {
      const stacks = startPlaceStacks();
      expect(stacks.place).toBe("home");
      expect(shown(stacks)).toBe("home");
      expect(isAtPlaceTop(stacks)).toBe(true);
      expect(showsBottomNavigation(stacks)).toBe(true);
    });

    it("shows another place where the user left it", () => {
      const stacks = switchPhonePlace(switchPhonePlace(on("inbox", card), "runs"), "inbox");
      expect(shown(stacks)).toBe(card.key);
    });

    it("goes back to the top when the place shown is tapped", () => {
      const stacks = switchPhonePlace(on("inbox", card), "inbox");
      expect(shown(stacks)).toBe("inbox");
      expect(isAtPlaceTop(stacks)).toBe(true);
    });

    it("changes nothing when the place shown is tapped at its top", () => {
      const stacks = on("inbox");
      expect(switchPhonePlace(stacks, "inbox")).toBe(stacks);
    });

    it("puts each sidebar place in its phone place", () => {
      expect(phonePlaceOf("home")).toBe("home");
      expect(phonePlaceOf("inbox")).toBe("inbox");
      expect(phonePlaceOf("runs")).toBe("runs");
      for (const place of ["agents", "workflows", "routines", "library", "changes"] as const) {
        expect(phonePlaceOf(place)).toBe("more");
      }
    });
  });

  describe("opening", () => {
    it("opens a page on top of the place shown and hides the bottom navigation", () => {
      const stacks = on("runs", run);
      expect(shown(stacks)).toBe(run.key);
      expect(isAtPlaceTop(stacks)).toBe(false);
      expect(showsBottomNavigation(stacks)).toBe(false);
    });

    it("keeps the bottom navigation on a list", () => {
      const skills = { key: "library/skills", title: "Skills" };
      const stacks = openPhonePage(on("more"), skills, { list: true });
      expect(showsBottomNavigation(stacks)).toBe(true);
    });

    it("changes nothing when the page shown is opened again", () => {
      const stacks = on("runs", run);
      expect(openPhonePage(stacks, run)).toBe(stacks);
    });

    it("opens a list under More right above the More page, with the bottom navigation", () => {
      const stacks = openPhonePage(on("runs", run), workflows);
      expect(stacks.place).toBe("more");
      expect(shown(stacks)).toBe("workflows");
      expect(showsBottomNavigation(stacks)).toBe(true);
      expect(shown(goBackOnPhone(stacks) as PlaceStacks)).toBe("more");
    });

    it("opens Settings as a list right above the More page, with the bottom navigation", () => {
      const stacks = openPhonePage(on("more", workflows, workflow), settingsLocation);
      expect(stacks.place).toBe("more");
      expect(stacks.stacks.more.map((page) => page.location.key)).toEqual(["more", "settings"]);
      expect(showsBottomNavigation(stacks)).toBe(true);
      expect(shown(goBackOnPhone(stacks) as PlaceStacks)).toBe("more");
    });

    it("opens Settings under More from a link in another place", () => {
      const stacks = openPhonePageIn(on("runs", run), "inbox", settingsLocation);
      expect(stacks.place).toBe("more");
      expect(shown(stacks)).toBe("settings");
      expect(currentPhonePage(stacks).from).toBeUndefined();
    });

    it("opens Inbox or Runs at their top from anywhere", () => {
      const stacks = openPhonePage(on("inbox", card), { key: "runs", title: "Runs" });
      expect(stacks.place).toBe("runs");
      expect(isAtPlaceTop(stacks)).toBe(true);
    });

    it("keeps the opened item's page in the list's place", () => {
      const stacks = openPhonePage(openPhonePage(on("more"), workflows), workflow);
      expect(stacks.place).toBe("more");
      expect(stacks.stacks.more.map((page) => page.location.key)).toEqual([
        "more",
        "workflows",
        workflow.key,
      ]);
    });
  });

  describe("links between places", () => {
    it("opens the page on the other place, and Back returns to where the link was", () => {
      const reviewing = openPhonePageIn(on("runs", run), "inbox", card);
      expect(reviewing.place).toBe("inbox");
      expect(shown(reviewing)).toBe(card.key);
      const back = goBackOnPhone(reviewing) as PlaceStacks;
      expect(back.place).toBe("runs");
      expect(shown(back)).toBe(run.key);
      expect(shown(switchPhonePlace(back, "inbox"))).toBe("inbox");
    });

    it("opens in the place shown when the link stays in it", () => {
      const stacks = openPhonePageIn(on("runs"), "runs", run);
      expect(currentPhonePage(stacks).from).toBeUndefined();
    });
  });

  describe("Back", () => {
    it("goes one page up in the place's stack", () => {
      const back = goBackOnPhone(on("more", workflows, workflow)) as PlaceStacks;
      expect(shown(back)).toBe("workflows");
    });

    it("goes to Home from the top of Inbox, Runs or More", () => {
      for (const place of ["inbox", "runs", "more"] as const) {
        const back = goBackOnPhone(on(place)) as PlaceStacks;
        expect(back.place).toBe("home");
      }
    });

    it("leaves the Studio from the top of Home", () => {
      expect(goBackOnPhone(startPlaceStacks())).toBeUndefined();
    });

    it("never goes to another place's stack from a place's top", () => {
      const fromRuns = switchPhonePlace(on("inbox", card), "runs");
      const back = goBackOnPhone(fromRuns) as PlaceStacks;
      expect(back.place).toBe("home");
    });
  });
});
