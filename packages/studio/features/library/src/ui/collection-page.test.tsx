// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import { cellText } from "../collection-format.ts";
import type { CollectionColumn } from "../collection-host.ts";
import {
  cell,
  chips,
  nobody,
  opened,
  rich,
  sourceOf,
  swim,
  trip,
  typeInto,
} from "./collection-page.fixture.tsx";

verifies("library.collection-page", () => {
  describe("CollectionPage", () => {
    it("shows the chips with counts and totals, with All chosen", async () => {
      const { root } = await opened(sourceOf([swim, trip]));
      expect(chips(root)).toEqual(["All (2)", "open (1) · 45,00"]);
      expect(root.querySelector<HTMLInputElement>('input[type="radio"]:checked')?.value).toBe(
        "~all",
      );
    });

    it("shows a column per field with * for required and ƒ for computed", async () => {
      const { root } = await opened(sourceOf([swim]));
      const headers = [...root.querySelectorAll("th")].map((header) => header.textContent);
      expect(headers).toEqual(["what *required", "amount *required", "share ƒcomputed", ""]);
      // The marks are hidden from a screen reader, which hears the words instead.
      const spoken = [...root.querySelectorAll("th")].map((header) =>
        [...header.childNodes]
          .filter((node) => !(node instanceof Element && node.getAttribute("aria-hidden")))
          .map((node) => node.textContent)
          .join("")
          .replace(/\s+/g, " ")
          .trim(),
      );
      expect(spoken).toEqual(["what required", "amount required", "share computed", ""]);
      expect(root.querySelector('[role="grid"]')?.getAttribute("aria-label")).toBe(
        "Claims records",
      );
    });

    it("shows the records with money in the nl-NL format and empty values as nothing", async () => {
      const { root } = await opened(sourceOf([swim, trip]));
      const rows = [...root.querySelectorAll("tbody tr")].map((row) =>
        [...row.querySelectorAll("td")].slice(0, 3).map((cell) => cell.textContent),
      );
      // The last row is the new one, empty.
      expect(rows).toEqual([
        ["Swim lesson", "60,00", "45,00"],
        ["Trip", "20,00", ""],
        ["", "", ""],
      ]);
    });

    it("shows plain numbers in nl-NL like money, and booleans as words", () => {
      const column = (type: CollectionColumn["type"]): CollectionColumn => ({
        name: "x",
        type,
        required: false,
        computed: false,
        choices: [],
      });
      expect(cellText(column("number"), 1.5)).toBe("1,5");
      expect(cellText(column("money"), 1.5)).toBe("1,50");
      expect(cellText(column("boolean"), true)).toBe("yes");
      expect(cellText(column("boolean"), false)).toBe("no");
    });

    it("shows only the chosen view's records", async () => {
      const { root } = await opened(sourceOf([swim, trip]));
      const open = root.querySelector<HTMLInputElement>('input[value="view:open"]');
      await act(async () => open?.click());
      // The record and the new row.
      expect(root.querySelectorAll("tbody tr")).toHaveLength(2);
      expect(root.querySelector("tbody")?.textContent).toContain("Swim lesson");
      expect(root.querySelector("tbody")?.textContent).not.toContain("Trip");
    });

    it("is one Tab stop in the grid", async () => {
      const { root } = await opened(sourceOf([swim, trip]));
      const stops = [...root.querySelectorAll('[role="gridcell"]')].filter(
        (cell) => cell.getAttribute("tabindex") === "0",
      );
      expect(stops).toHaveLength(1);
    });

    it("says nobody uses a collection nobody uses, and names who does", async () => {
      const { root } = await opened(sourceOf([swim]));
      expect(root.textContent).toContain("No agent uses this collection yet.");
      const used = await opened(sourceOf([swim]), {
        ...nobody,
        agents: [{ id: "household", name: "Household", hub: null }],
      });
      expect(used.root.textContent).toContain("Household");
    });

    it("says the records are kept only while Studio is open, in the demo", async () => {
      const demo = await opened(sourceOf([swim], true));
      expect(demo.root.textContent).toContain("Records are kept only while this Studio is open.");
      const kept = await opened(sourceOf([swim]));
      expect(kept.root.textContent).not.toContain("kept only while");
    });

    it("says the collection isn't in the workspace any more, with Go to Library", async () => {
      const { root, openPlace } = await opened(undefined);
      expect(root.textContent).toContain("This collection isn't in this workspace any more.");
      const go = [...root.querySelectorAll("button")].find(
        (button) => button.textContent === "Go to Library",
      );
      await act(async () => go?.click());
      expect(openPlace).toHaveBeenCalledWith("library");
    });
  });
  describe("CollectionPage new row", () => {
    it("says what is still needed under the grid and adds nothing yet", async () => {
      const add = vi.fn(async () => {});
      const source = sourceOf([swim], false, {
        newRow: (typed) => ({ draft: typed, stillNeeded: ["amount"] }),
      });
      const { root } = await opened(source, undefined, { add });
      expect(root.textContent).toContain("Fill the last row to add a record: still needed amount.");
      await typeInto(root, 1, 0, "Taxi");
      expect(add).not.toHaveBeenCalled();
    });

    it("shows a default as a default tag in the new row", async () => {
      const source = sourceOf([swim], false, {
        newRow: (typed) => ({ draft: { ...typed, amount: "100" }, stillNeeded: [] }),
      });
      const { root } = await opened(source);
      expect(cell(root, 1, 1).textContent).toBe("100 default");
    });

    it("adds the record once every required field is filled", async () => {
      const add = vi.fn(async () => {});
      const source = sourceOf([swim], false, {
        newRow: (typed) =>
          typed["what"] === undefined
            ? { draft: typed, stillNeeded: ["what"] }
            : { draft: typed, stillNeeded: [], record: { what: typed["what"] } },
      });
      const { root } = await opened(source, undefined, { add });
      await typeInto(root, 1, 0, "Taxi");
      expect(add).toHaveBeenCalledWith({ hub: null, id: "claims" }, { what: "Taxi" });
      expect(cell(root, 1, 0).textContent).toBe("");
    });
    it("says the record couldn't be added when the write fails", async () => {
      const source = rich({
        newRow: (typed) => ({ draft: typed, stillNeeded: [], record: { what: typed["what"] } }),
      });
      const { root } = await opened(source, undefined, {
        add: async () => {
          throw new Error("disk");
        },
      });
      await typeInto(root, 1, 0, "Taxi");
      expect(root.textContent).toContain("Couldn't add the record.");
    });
  });
});
