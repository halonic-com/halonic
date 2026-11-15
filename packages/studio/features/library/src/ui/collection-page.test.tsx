// @vitest-environment jsdom
import type { ItemUsage } from "@halonicjs/app";
import type { ItemViewProps } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cellText } from "../collection-format.ts";
import {
  type CollectionColumn,
  type CollectionHost,
  CollectionHostService,
  type CollectionRow,
  type CollectionSource,
} from "../collection-host.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { CollectionPage } from "./collection-page.tsx";

afterEach(unmountAll);

const nobody: ItemUsage = { agents: [], hubs: [], routines: [], collections: [] };

const fields: CollectionColumn[] = [
  { name: "what", type: "text", required: true, computed: false, choices: [] },
  { name: "amount", type: "money", required: true, computed: false, choices: [] },
  { name: "share", type: "money", required: false, computed: true, choices: [] },
];

const swim: CollectionRow = {
  id: "swim-oct",
  values: { what: "Swim lesson", amount: 60, share: 45 },
};
const trip: CollectionRow = { id: "trip", values: { what: "Trip", amount: 20, share: null } };

function sourceOf(rows: readonly CollectionRow[], volatile = false): CollectionSource {
  return {
    name: "Claims",
    volatile,
    grid: (view) => ({
      fields,
      views: [
        { view: null, count: rows.length },
        { view: "open", count: 1, total: 45 },
      ],
      rows: view === "open" ? rows.slice(0, 1) : rows,
    }),
    editCell: () => ({ ok: true, values: {} }),
    newRow: (typed) => ({ draft: typed, stillNeeded: [] }),
  };
}

function setup(source: CollectionSource | undefined, usage: ItemUsage = nobody) {
  const host: CollectionHost = {
    read: async () => source,
    change: async () => "saved",
    add: async () => {},
    remove: async () => {},
    usage: async () => usage,
    subscribe: () => () => {},
  };
  const openItem = vi.fn();
  const openPlace = vi.fn();
  const props = {
    item: { kind: "collection", hub: "~workspace", id: "claims" },
    context: {
      services: {
        get: (key: unknown) => (key === CollectionHostService ? host : undefined),
        find: (key: unknown) => (key === CollectionHostService ? host : undefined),
      },
      announcer: { announceState: vi.fn() },
      openItem,
      openPlace,
    },
    Sections: () => null,
  } as unknown as ItemViewProps;
  return { props, openItem, openPlace };
}

async function settled(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function opened(source: CollectionSource | undefined, usage?: ItemUsage) {
  const { props, ...rest } = setup(source, usage);
  const root = render(<CollectionPage {...props} />);
  await settled();
  return { root, ...rest };
}

function chips(root: HTMLElement): string[] {
  return [...root.querySelectorAll('[role="radiogroup"] label')].map(
    (label) => label.textContent ?? "",
  );
}

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
      expect(headers).toEqual(["what *required", "amount *required", "share ƒcomputed"]);
      // The marks are hidden from a screen reader, which hears the words instead.
      const spoken = [...root.querySelectorAll("th")].map((header) =>
        [...header.childNodes]
          .filter((node) => !(node instanceof Element && node.getAttribute("aria-hidden")))
          .map((node) => node.textContent)
          .join("")
          .replace(/\s+/g, " ")
          .trim(),
      );
      expect(spoken).toEqual(["what required", "amount required", "share computed"]);
      expect(root.querySelector('[role="grid"]')?.getAttribute("aria-label")).toBe(
        "Claims records",
      );
    });

    it("shows the records with money in the nl-NL format and empty values as nothing", async () => {
      const { root } = await opened(sourceOf([swim, trip]));
      const rows = [...root.querySelectorAll("tbody tr")].map((row) =>
        [...row.querySelectorAll("td")].map((cell) => cell.textContent),
      );
      expect(rows).toEqual([
        ["Swim lesson", "60,00", "45,00"],
        ["Trip", "20,00", ""],
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
      expect(root.querySelectorAll("tbody tr")).toHaveLength(1);
      expect(root.querySelector("tbody")?.textContent).toContain("Swim lesson");
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
});
