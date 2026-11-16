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
import { fakeModal, restoreModal } from "../test-support/modal.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { CollectionPage } from "./collection-page.tsx";

// jsdom has no `popover`; the row menu only needs its open and close to exist.
Object.assign(HTMLElement.prototype, {
  showPopover: () => {},
  hidePopover: () => {},
  togglePopover: () => false,
});
fakeModal();
afterEach(() => {
  unmountAll();
  restoreModal();
  fakeModal();
});

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

function sourceOf(
  rows: readonly CollectionRow[],
  volatile = false,
  rules: Partial<Pick<CollectionSource, "editCell" | "newRow">> = {},
  columns: readonly CollectionColumn[] = fields,
): CollectionSource {
  return {
    name: "Claims",
    volatile,
    grid: (view) => ({
      fields: columns,
      views: [
        { view: null, count: rows.length },
        { view: "open", count: 1, total: 45 },
      ],
      rows: view === "open" ? rows.slice(0, 1) : rows,
    }),
    editCell: () => ({ ok: true, values: {} }),
    newRow: (typed) => ({ draft: typed, stillNeeded: [] }),
    ...rules,
  };
}

function setup(
  source: CollectionSource | undefined,
  usage: ItemUsage = nobody,
  writes: Partial<Pick<CollectionHost, "change" | "add" | "remove">> = {},
) {
  const host: CollectionHost = {
    read: async () => source,
    change: async () => "saved",
    add: async () => {},
    remove: async () => {},
    usage: async () => usage,
    subscribe: () => () => {},
    ...writes,
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
  return { props, host, openItem, openPlace };
}

async function settled(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function opened(
  source: CollectionSource | undefined,
  usage?: ItemUsage,
  writes?: Parameters<typeof setup>[2],
) {
  const { props, ...rest } = setup(source, usage, writes);
  const root = render(<CollectionPage {...props} />);
  await settled();
  return { root, ...rest };
}

function chips(root: HTMLElement): string[] {
  return [...root.querySelectorAll('[role="radiogroup"] label')].map(
    (label) => label.textContent ?? "",
  );
}

const cell = (root: HTMLElement, row: number, column: number): HTMLElement =>
  root.querySelectorAll("tbody tr")[row]?.querySelectorAll<HTMLElement>("td")[
    column
  ] as HTMLElement;

/** Opens a cell's editor with Enter, types `text` and leaves the cell. */
async function typeInto(root: HTMLElement, row: number, column: number, text: string) {
  await act(async () => {
    cell(root, row, column).dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
  });
  const input = cell(root, row, column).querySelector("input") as HTMLInputElement;
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  await act(async () => {
    set?.call(input, text);
    input.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

/** The dialog's Remove: the menu's comes first, so it is the last one. */
async function pressConfirm(root: HTMLElement) {
  const confirm = [...root.ownerDocument.querySelectorAll("button")]
    .filter((each) => each.textContent?.startsWith("Remove"))
    .at(-1);
  await act(async () => {
    confirm?.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function pressButton(root: HTMLElement, label: string) {
  const button = [...root.ownerDocument.querySelectorAll("button")].find((each) =>
    each.textContent?.startsWith(label),
  );
  await act(async () => {
    button?.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

const amountEdit: CollectionSource["editCell"] = (field, text) =>
  Number.isNaN(Number(text))
    ? { ok: false, message: `${field} needs a number.` }
    : { ok: true, values: { [field]: text === "" ? null : Number(text) } };

/** A choice and a yes/no column next to the text and money ones. */
const richFields: CollectionColumn[] = [
  { name: "what", type: "text", required: true, computed: false, choices: [] },
  { name: "amount", type: "money", required: true, computed: false, choices: [] },
  { name: "kind", type: "choice", required: false, computed: false, choices: ["food", "travel"] },
  { name: "done", type: "boolean", required: false, computed: false, choices: [] },
];
const meal: CollectionRow = {
  id: "meal",
  values: { what: "Meal", amount: 12, kind: "food", done: false },
};
const richEdit: CollectionSource["editCell"] = (field, text) => {
  if (field === "amount") return amountEdit(field, text);
  if (field === "done") return { ok: true, values: { done: text === "true" } };
  return { ok: true, values: { [field]: text === "" ? null : text } };
};
const rich = (rules: Partial<Pick<CollectionSource, "editCell" | "newRow">> = {}) =>
  sourceOf([meal], false, { editCell: richEdit, ...rules }, richFields);

/** Presses a key on a cell, or on the editor inside it when `inside` is set. */
async function press(root: HTMLElement, row: number, column: number, key: string, inside = false) {
  const target = inside
    ? (cell(root, row, column).querySelector("input, select") as Element)
    : cell(root, row, column);
  await act(async () => {
    target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

/** Picks a value in a cell's open list. */
async function pick(root: HTMLElement, row: number, column: number, value: string) {
  const select = cell(root, row, column).querySelector("select") as HTMLSelectElement;
  await act(async () => {
    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function leave(root: HTMLElement, row: number, column: number, tag: string) {
  const control = cell(root, row, column).querySelector(tag) as Element;
  await act(async () => {
    control.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
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
  describe("CollectionPage editing", () => {
    it("saves what was typed into a cell as one change when the cell is left", async () => {
      const change = vi.fn(async () => "saved" as const);
      const { root } = await opened(sourceOf([swim], false, { editCell: amountEdit }), undefined, {
        change,
      });
      await typeInto(root, 0, 1, "65");
      expect(change).toHaveBeenCalledTimes(1);
      expect(change).toHaveBeenCalledWith({ hub: null, id: "claims" }, "swim-oct", { amount: 65 });
    });

    it("saves an emptied cell as null", async () => {
      const change = vi.fn(async () => "saved" as const);
      const { root } = await opened(sourceOf([swim], false, { editCell: amountEdit }), undefined, {
        change,
      });
      await typeInto(root, 0, 1, "");
      expect(change).toHaveBeenCalledWith(expect.anything(), "swim-oct", { amount: null });
    });

    it("writes nothing for an unchanged value", async () => {
      const change = vi.fn(async () => "saved" as const);
      const { root } = await opened(sourceOf([swim], false, { editCell: amountEdit }), undefined, {
        change,
      });
      await typeInto(root, 0, 1, "60");
      expect(change).not.toHaveBeenCalled();
    });

    it("shows the core message under a cell whose value isn't accepted, and writes nothing", async () => {
      const change = vi.fn(async () => "saved" as const);
      const { root } = await opened(sourceOf([swim], false, { editCell: amountEdit }), undefined, {
        change,
      });
      await typeInto(root, 0, 1, "lots");
      expect(change).not.toHaveBeenCalled();
      expect(cell(root, 0, 1).textContent).toContain("amount needs a number.");
      // The next edit of that cell clears the message.
      await act(async () => {
        cell(root, 0, 1).dispatchEvent(
          new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
        );
      });
      expect(cell(root, 0, 1).textContent).not.toContain("needs a number");
    });

    it("opens no editor in a computed cell", async () => {
      const { root } = await opened(sourceOf([swim]));
      await act(async () => {
        cell(root, 0, 2).dispatchEvent(
          new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
        );
      });
      expect(cell(root, 0, 2).querySelector("input")).toBeNull();
    });

    it("says the row was removed by another change when the host finds it gone", async () => {
      const { root } = await opened(
        sourceOf([swim, trip], false, { editCell: amountEdit }),
        undefined,
        {
          change: async () => "removed",
        },
      );
      await typeInto(root, 1, 1, "30");
      expect(root.textContent).toContain("Row removed by another change.");
      expect(root.querySelectorAll("tbody tr").length).toBeGreaterThan(1);
    });

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

    it("asks before removing a record, and removes it on Remove", async () => {
      const remove = vi.fn(async () => {});
      const { root } = await opened(sourceOf([swim]), undefined, { remove });
      await pressButton(root, "Remove");
      expect(root.ownerDocument.body.textContent).toContain("Remove swim-oct?");
      expect(remove).not.toHaveBeenCalled();
      // The menu's Remove comes first; the dialog's is the last one.
      const confirm = [...root.ownerDocument.querySelectorAll("button")]
        .filter((each) => each.textContent?.startsWith("Remove"))
        .at(-1);
      await act(async () => {
        (confirm as HTMLElement).click();
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
      expect(remove).toHaveBeenCalledWith({ hub: null, id: "claims" }, "swim-oct");
    });

    it("drops what was typed on Escape and writes nothing", async () => {
      const change = vi.fn(async () => "saved" as const);
      const { root } = await opened(sourceOf([swim], false, { editCell: amountEdit }), undefined, {
        change,
      });
      await press(root, 0, 1, "Enter");
      const input = cell(root, 0, 1).querySelector("input") as HTMLInputElement;
      input.value = "99";
      await press(root, 0, 1, "Escape", true);
      expect(change).not.toHaveBeenCalled();
      expect(cell(root, 0, 1).querySelector("input")).toBeNull();
      expect(cell(root, 0, 1).textContent).toBe("60,00");
    });

    it("saves a picked choice and closes the list", async () => {
      const change = vi.fn(async () => "saved" as const);
      const { root } = await opened(rich(), undefined, { change });
      await press(root, 0, 2, "Enter");
      await pick(root, 0, 2, "travel");
      expect(change).toHaveBeenCalledWith(expect.anything(), "meal", { kind: "travel" });
      expect(cell(root, 0, 2).querySelector("select")).toBeNull();
    });

    it("closes a choice's list on Escape without a write", async () => {
      const change = vi.fn(async () => "saved" as const);
      const { root } = await opened(rich(), undefined, { change });
      await press(root, 0, 2, "Enter");
      expect(cell(root, 0, 2).querySelector("select")).not.toBeNull();
      await press(root, 0, 2, "Escape", true);
      expect(cell(root, 0, 2).querySelector("select")).toBeNull();
      expect(change).not.toHaveBeenCalled();
    });

    it("closes a choice's list when the cell is left, keeping the value", async () => {
      const change = vi.fn(async () => "saved" as const);
      const { root } = await opened(rich(), undefined, { change });
      await press(root, 0, 2, "Enter");
      await leave(root, 0, 2, "select");
      expect(cell(root, 0, 2).querySelector("select")).toBeNull();
      expect(change).not.toHaveBeenCalled();
      expect(cell(root, 0, 2).textContent).toBe("food");
    });

    it("flips a yes/no cell with Enter, with no editor", async () => {
      const change = vi.fn(async () => "saved" as const);
      const { root } = await opened(rich(), undefined, { change });
      await press(root, 0, 3, "Enter");
      expect(change).toHaveBeenCalledWith(expect.anything(), "meal", { done: true });
      expect(cell(root, 0, 3).querySelector("input")).toBeNull();
    });

    it("flips a yes/no cell of the new row on and back off, showing yes and no", async () => {
      const { root } = await opened(rich());
      await press(root, 1, 3, "Enter");
      expect(cell(root, 1, 3).textContent).toBe("yes");
      await press(root, 1, 3, "Enter");
      expect(cell(root, 1, 3).textContent).toBe("no");
    });

    it("says the change couldn't be saved when the write fails", async () => {
      const { root } = await opened(rich(), undefined, {
        change: async () => {
          throw new Error("disk");
        },
      });
      await typeInto(root, 0, 0, "Lunch");
      expect(cell(root, 0, 0).textContent).toContain("Couldn't save the change.");
    });

    it("still says it when another cell holds a refused value", async () => {
      const { root } = await opened(
        sourceOf([meal], false, { editCell: richEdit }, richFields),
        undefined,
        {
          change: async () => {
            throw new Error("disk");
          },
        },
      );
      await typeInto(root, 0, 1, "lots");
      expect(cell(root, 0, 1).textContent).toContain("amount needs a number.");
      await typeInto(root, 0, 0, "Lunch");
      expect(cell(root, 0, 0).textContent).toContain("Couldn't save the change.");
    });

    it("says a yes/no flip couldn't be saved after an earlier removed row", async () => {
      let removed = true;
      const { root } = await opened(rich(), undefined, {
        change: async () => {
          if (removed) return "removed";
          throw new Error("disk");
        },
      });
      await press(root, 0, 3, "Enter");
      expect(root.textContent).toContain("Row removed by another change.");
      removed = false;
      await press(root, 0, 3, "Enter");
      expect(cell(root, 0, 3).textContent).toContain("Couldn't save the change.");
      expect(root.textContent).not.toContain("Row removed by another change.");
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

    it("keeps Remove's dialog open and says why when the write fails", async () => {
      const { root } = await opened(sourceOf([swim]), undefined, {
        remove: async () => {
          throw new Error("disk");
        },
      });
      await pressButton(root, "Remove");
      await pressConfirm(root);
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });
      expect(root.ownerDocument.body.textContent).toContain("Couldn't remove the record.");
      expect(root.ownerDocument.body.textContent).toContain("Remove swim-oct?");
    });

    it("closes Remove's dialog on Cancel without removing", async () => {
      const remove = vi.fn(async () => {});
      const { root } = await opened(sourceOf([swim]), undefined, { remove });
      await pressButton(root, "Remove");
      await pressButton(root, "Cancel");
      expect(remove).not.toHaveBeenCalled();
      expect(root.ownerDocument.body.textContent).not.toContain("Remove swim-oct?");
    });

    it("shows Removing… and sends one remove however often Remove is pressed", async () => {
      let finish: () => void = () => {};
      const remove = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
      const { root } = await opened(sourceOf([swim]), undefined, { remove });
      await pressButton(root, "Remove");
      await pressConfirm(root);
      await pressConfirm(root);
      expect(remove).toHaveBeenCalledTimes(1);
      const confirm = [...root.ownerDocument.querySelectorAll("button")]
        .filter((each) => each.textContent?.startsWith("Remove"))
        .at(-1);
      expect(confirm?.getAttribute("aria-busy")).toBe("true");
      await act(async () => finish());
    });
  });
});
