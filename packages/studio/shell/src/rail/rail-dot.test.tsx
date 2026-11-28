// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { act, useState } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Registered } from "../points/point-store.ts";
import { homeRailEntry, type RailEntry, settingsRailEntry } from "../points/rail.ts";
import { searchPageLocation } from "../search/search-page-names.ts";
import { TabSet } from "../tabs/tab-set.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { IconRail } from "./icon-rail.tsx";
import { useRailColumn } from "./rail-column.ts";
import { railDotMotionAttribute } from "./rail-dot-motion.ts";

function entry(id: RailEntry["id"], label: string): Registered<RailEntry> {
  return {
    id,
    label,
    icon: id,
    order: 10,
    opens: id,
    holds: [id],
    shows: () => true,
    featureId: "test",
  };
}

const home: Registered<RailEntry> = { ...homeRailEntry, featureId: "test" };
const settings: Registered<RailEntry> = { ...settingsRailEntry, featureId: "test" };
const library = entry("library", "Library");
const inbox = entry("inbox", "Inbox");

/** Where a rail button is drawn: 40px, 12px in, 48px from one to the next, by its place in the list. */
function buttonBox(button: HTMLElement): DOMRect | undefined {
  const item = button.closest("li");
  if (item === null || item.parentElement === null) return undefined;
  return new DOMRect(12, 8 + 48 * [...item.parentElement.children].indexOf(item), 40, 40);
}

interface Played {
  readonly part: "dot" | "ring";
  readonly keyframes: Keyframe[];
  readonly timing: KeyframeAnimationOptions;
  playState: AnimationPlayState;
  cancelled: boolean;
}

let played: Played[] = [];
/** Where the dot is drawn while it travels: jsdom lays nothing out. */
let dotBox = new DOMRect(0, 0, 6, 6);
let reducedMotion = false;
const original = {
  animate: HTMLElement.prototype.animate,
  box: HTMLElement.prototype.getBoundingClientRect,
  matchMedia: window.matchMedia,
};

beforeEach(() => {
  played = [];
  reducedMotion = false;
  HTMLElement.prototype.animate = function animate(this: HTMLElement, keyframes, timing) {
    const one: Played = {
      part: this.hasAttribute("data-rail-dot") ? "dot" : "ring",
      keyframes: keyframes as Keyframe[],
      timing: timing as KeyframeAnimationOptions,
      playState: "finished",
      cancelled: false,
    };
    played.push(one);
    return {
      get playState() {
        return one.playState;
      },
      cancel: () => {
        one.cancelled = true;
      },
    } as Animation;
  };
  HTMLElement.prototype.getBoundingClientRect = function box(this: HTMLElement) {
    if (this.hasAttribute("data-rail-dot")) return dotBox;
    return buttonBox(this) ?? new DOMRect(0, 0, 64, 600);
  };
  window.matchMedia = (query) =>
    ({ media: query, matches: reducedMotion && query.includes("reduce") }) as MediaQueryList;
});

afterEach(() => {
  unmountAll();
  HTMLElement.prototype.animate = original.animate;
  HTMLElement.prototype.getBoundingClientRect = original.box;
  window.matchMedia = original.matchMedia;
  document.documentElement.removeAttribute(railDotMotionAttribute);
});

function renderRail(entries = [settings, home, library, inbox]) {
  const tabs = new TabSet();
  const container = render(
    <IconRail entries={entries} tabs={tabs} placeOfKind={() => undefined} onSettings={() => {}} />,
  );
  const dot = container.querySelector("nav [data-rail-dot]") as HTMLElement;
  const ring = container.querySelector("nav [data-rail-ring]") as HTMLElement;
  const go = (key: string) => act(() => tabs.openHere({ key, title: key }));
  const at = (element: HTMLElement) => [element.style.left, element.style.top];
  return { container, tabs, dot, ring, go, at };
}

/** The rail as the window shows it, with the list column's selection, so a pick with no page selects. */
function RailWithColumn({ entries, tabs }: { entries: Registered<RailEntry>[]; tabs: TabSet }) {
  const column = useRailColumn(entries, tabs, () => undefined);
  return <IconRail entries={entries} tabs={tabs} placeOfKind={() => undefined} column={column} />;
}

verifies("shell.rail-dot", () => {
  describe("the rail's white dot", () => {
    it("rests on the selected button's centre, unseen by screen readers, without a motion", () => {
      const rail = renderRail();
      expect(rail.at(rail.dot)).toEqual(["32px", "28px"]);
      expect(rail.dot.hidden).toBe(false);
      expect(rail.dot.getAttribute("aria-hidden")).toBe("true");
      expect(rail.dot.className).toContain("pointer-events-none");
      expect(rail.container.querySelectorAll("[data-rail-dot]")).toHaveLength(1);
      expect(played).toEqual([]);
    });

    it("travels to the newly selected button as Lead when the window names no motion", () => {
      const rail = renderRail();
      rail.go("inbox");
      expect(rail.at(rail.dot)).toEqual(["32px", "124px"]);
      expect(played.map((one) => one.part)).toEqual(["dot", "dot"]);
      expect(played[0]?.keyframes).toEqual([{ translate: "0px -96px" }, { translate: "0px 0px" }]);
    });

    it("shows no dot while no entry is selected, and comes back without a motion", () => {
      const rail = renderRail();
      act(() => rail.tabs.openHere(searchPageLocation("invoices")));
      expect(rail.dot.hidden).toBe(true);
      rail.go("library");
      expect(rail.dot.hidden).toBe(false);
      expect(rail.at(rail.dot)).toEqual(["32px", "76px"]);
      expect(played).toEqual([]);
    });

    it("travels to an entry picked with no page, as the window's rail selects it", () => {
      const messenger: Registered<RailEntry> = {
        ...entry("messenger", "Messenger"),
        opens: undefined,
      };
      const container = render(
        <RailWithColumn entries={[home, library, messenger]} tabs={new TabSet()} />,
      );
      const dot = container.querySelector("nav [data-rail-dot]") as HTMLElement;
      expect([dot.style.left, dot.style.top]).toEqual(["32px", "28px"]);
      act(() => (container.querySelector('nav [aria-label="Messenger"]') as HTMLElement).click());
      expect(dot.hidden).toBe(false);
      expect([dot.style.left, dot.style.top]).toEqual(["32px", "124px"]);
      expect(played.map((one) => one.part)).toEqual(["dot", "dot"]);
    });

    it("starts again from where it is when the selection moves mid-way", () => {
      const rail = renderRail();
      rail.go("inbox");
      for (const one of played) one.playState = "running";
      dotBox = new DOMRect(29, 87, 6, 6);
      rail.go("library");
      expect(played.slice(0, 2).every((one) => one.cancelled)).toBe(true);
      expect(played[2]?.keyframes).toEqual([{ translate: "0px 14px" }, { translate: "0px 0px" }]);
    });

    it("follows its button without a motion when the buttons move", () => {
      const tabs = new TabSet();
      let show: (shown: Registered<RailEntry>[]) => void = () => {};
      function Rail() {
        const [shown, setShown] = useState([home, inbox]);
        show = setShown;
        return <IconRail entries={shown} tabs={tabs} placeOfKind={() => undefined} />;
      }
      const dot = render(<Rail />).querySelector("[data-rail-dot]") as HTMLElement;
      expect(dot.style.top).toBe("28px");
      act(() => show([library, home, inbox]));
      expect(dot.style.top).toBe("76px");
      expect(played).toEqual([]);
    });

    it("only fades with reduced motion", () => {
      reducedMotion = true;
      const rail = renderRail();
      rail.go("inbox");
      expect(played).toHaveLength(1);
      expect(played[0]?.keyframes.map(({ opacity }) => opacity)).toEqual([1, 0, 0, 1]);
      expect(rail.at(rail.dot)).toEqual(["32px", "124px"]);
    });
  });
});

verifies("shell.rail-dot-streak", () => {
  it("plays Streak when the window's root names it", () => {
    document.documentElement.setAttribute(railDotMotionAttribute, "streak");
    const rail = renderRail();
    rail.go("inbox");
    expect(played.map((one) => one.part)).toEqual(["dot", "dot"]);
    expect(played[1]?.keyframes[4]).toEqual({ scale: "0.35 5.1", offset: 0.5 });
  });
});

verifies("shell.rail-dot-pulse", () => {
  it("opens one ring on the new button, and stops it for a new one on the next click", () => {
    document.documentElement.setAttribute(railDotMotionAttribute, "pulse");
    const rail = renderRail();
    rail.go("inbox");
    expect(played.map((one) => one.part)).toEqual(["dot", "dot", "ring", "ring"]);
    expect(rail.at(rail.ring)).toEqual(["32px", "124px"]);
    expect(rail.ring.getAttribute("aria-hidden")).toBe("true");
    expect(rail.ring.className).toContain("pointer-events-none");
    expect(rail.ring.className).toContain("opacity-0");
    rail.go("library");
    expect(played.slice(0, 4).every((one) => one.cancelled)).toBe(true);
    expect(rail.at(rail.ring)).toEqual(["32px", "76px"]);
    expect(played).toHaveLength(8);
  });

  it("opens no ring with reduced motion", () => {
    reducedMotion = true;
    document.documentElement.setAttribute(railDotMotionAttribute, "pulse");
    const rail = renderRail();
    rail.go("inbox");
    expect(played.map((one) => one.part)).toEqual(["dot"]);
  });
});
