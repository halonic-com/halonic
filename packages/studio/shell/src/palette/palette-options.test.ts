import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import type { PressedKey } from "../tabs/window-keys.ts";
import type { PaletteContent, PaletteRow } from "./palette-groups.ts";
import {
  keptActive,
  movedActive,
  paletteKeyFor,
  paletteOptionName,
  paletteOptions,
  resultCountText,
} from "./palette-options.ts";

function press(key: string, held: Partial<PressedKey> = {}): PressedKey {
  return {
    key,
    code: "",
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    altKey: false,
    ...held,
  };
}

const supportReply: PaletteRow = {
  key: "workflow/acme/support-reply",
  label: "Support reply",
  open: true,
  target: {
    kind: "location",
    location: { key: "workflow/acme/support-reply", title: "Support reply", kind: "workflow" },
  },
};
const refundChecker: PaletteRow = {
  key: "agent/acme/refund-checker",
  label: "Refund checker",
  detail: "Agent · acme",
  open: false,
  target: { kind: "item", item: { kind: "agent", hub: "acme", id: "refund-checker" } },
};
const inbox: PaletteRow = {
  key: "inbox",
  label: "Inbox",
  open: false,
  target: { kind: "location", location: { key: "inbox", title: "Inbox" } },
};
const newTab: PaletteRow = {
  key: "action:shell.new-tab",
  label: "New tab",
  open: false,
  target: { kind: "action", command: "shell.new-tab" },
};

function content(rows: readonly PaletteRow[][], couldNotSearch = false): PaletteContent {
  return {
    groups: rows.map((group, index) => ({
      id: index === 0 ? "items" : "actions",
      title: index === 0 ? "Agents, workflows and more" : "Actions",
      rows: group,
    })),
    nothingFound: false,
    couldNotSearch,
  };
}

verifies("shell.palette-options", () => {
  describe("keys", () => {
    it("moves with ↓ and ↑, opens with Enter, and in a new tab with Ctrl Enter", () => {
      expect(paletteKeyFor(press("ArrowDown"), "windows")).toEqual({ kind: "move", step: 1 });
      expect(paletteKeyFor(press("ArrowUp"), "linux")).toEqual({ kind: "move", step: -1 });
      expect(paletteKeyFor(press("Enter"), "windows")).toEqual({ kind: "open", inNewTab: false });
      expect(paletteKeyFor(press("Enter", { ctrlKey: true }), "windows")).toEqual({
        kind: "open",
        inNewTab: true,
      });
    });

    it("reads Mod as Cmd on macOS", () => {
      expect(paletteKeyFor(press("Enter", { metaKey: true }), "macos")).toEqual({
        kind: "open",
        inNewTab: true,
      });
      expect(paletteKeyFor(press("k", { metaKey: true }), "macos")).toEqual({
        kind: "select-words",
      });
      expect(paletteKeyFor(press("Enter", { ctrlKey: true }), "macos")).toBeUndefined();
    });

    it("keeps Tab in the box and selects the words on Ctrl K rather than closing", () => {
      expect(paletteKeyFor(press("Tab"), "windows")).toEqual({ kind: "stay" });
      expect(paletteKeyFor(press("Tab", { shiftKey: true }), "windows")).toEqual({ kind: "stay" });
      expect(paletteKeyFor(press("K", { ctrlKey: true }), "windows")).toEqual({
        kind: "select-words",
      });
    });

    it("leaves Home, End, letters and Alt to the box", () => {
      for (const pressed of [
        press("Home"),
        press("End"),
        press("a"),
        press("ArrowDown", { altKey: true }),
        press("Enter", { shiftKey: true }),
      ]) {
        expect(paletteKeyFor(pressed, "windows")).toBeUndefined();
      }
    });
  });

  describe("the active row", () => {
    const options = paletteOptions(content([[supportReply, refundChecker], [newTab]]));

    it("lists the rows group after group", () => {
      expect(options.map((row) => row.label)).toEqual([
        "Support reply",
        "Refund checker",
        "New tab",
      ]);
    });

    it("moves across groups and wraps at both ends", () => {
      expect(movedActive(options, supportReply.key, 1)).toBe(refundChecker.key);
      expect(movedActive(options, refundChecker.key, 1)).toBe(newTab.key);
      expect(movedActive(options, newTab.key, 1)).toBe(supportReply.key);
      expect(movedActive(options, supportReply.key, -1)).toBe(newTab.key);
    });

    it("starts at the first row on ↓ and the last on ↑ when none is active", () => {
      expect(movedActive(options, undefined, 1)).toBe(supportReply.key);
      expect(movedActive(options, undefined, -1)).toBe(newTab.key);
      expect(movedActive([], undefined, 1)).toBeUndefined();
    });

    it("makes the first row active for new words", () => {
      const newWords = { wordsChanged: true, picked: true };
      expect(keptActive(options, newTab.key, newWords)).toBe(supportReply.key);
      expect(keptActive([], newTab.key, newWords)).toBeUndefined();
    });

    it("keeps the picked row when results for the same words arrive late", () => {
      const later = paletteOptions(content([[inbox, supportReply, refundChecker], [newTab]]));
      const sameWordsPicked = { wordsChanged: false, picked: true };
      expect(keptActive(later, refundChecker.key, sameWordsPicked)).toBe(refundChecker.key);
      expect(keptActive(later, "gone", sameWordsPicked)).toBe(inbox.key);
    });

    it("moves to a better match that arrives late when the user hasn't picked a row", () => {
      const later = paletteOptions(content([[inbox, supportReply, refundChecker], [newTab]]));
      const sameWordsUnpicked = { wordsChanged: false, picked: false };
      expect(keptActive(later, supportReply.key, sameWordsUnpicked)).toBe(inbox.key);
    });
  });

  describe("what a screen reader hears", () => {
    it("names an option with its kind and switch to tab when a tab shows it", () => {
      expect(paletteOptionName(supportReply)).toBe("Support reply, workflow, switch to tab");
      expect(paletteOptionName(refundChecker)).toBe("Refund checker, agent");
      expect(paletteOptionName(inbox)).toBe("Inbox");
      expect(paletteOptionName(newTab)).toBe("New tab");
    });

    it("counts the rows of every group", () => {
      expect(resultCountText(content([[supportReply, refundChecker], [newTab]]))).toBe("3 results");
      expect(resultCountText(content([[inbox]]))).toBe("1 result");
      expect(resultCountText(content([]))).toBe("No results");
    });

    it("says it couldn't search when a failed provider left nothing to show", () => {
      expect(resultCountText(content([], true))).toBe("Couldn't search");
    });
  });
});
