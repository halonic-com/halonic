// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  amountEdit,
  cell,
  cleanUp,
  fields,
  opened,
  pressButton,
  pressConfirm,
  sourceOf,
  swim,
  trip,
} from "../test-support/collection-page.tsx";

afterEach(cleanUp);

/** Presses a key on an element, with the given modifiers, and lets the page settle. */
async function key(target: Element, name: string, init: KeyboardEventInit = {}) {
  const event = new KeyboardEvent("keydown", {
    key: name,
    bubbles: true,
    cancelable: true,
    ...init,
  });
  await act(async () => {
    target.dispatchEvent(event);
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return event;
}

/** Focuses a cell the way a click or an arrow key does. */
function focusCell(root: HTMLElement, row: number, column: number): HTMLElement {
  const target = cell(root, row, column);
  act(() => target.focus());
  return target;
}

const rules = { editCell: amountEdit };
const many = Array.from({ length: 25 }, (_, index) => ({
  id: `row-${index}`,
  values: { what: `Row ${index}`, amount: index, share: null },
}));

verifies("library.collection-grid", () => {
  describe("CollectionPage grid keys", () => {
    it("opens the editor with the typed character in it, and saves the replaced value", async () => {
      const change = vi.fn(async () => "saved" as const);
      const { root } = await opened(sourceOf([swim], false, rules), undefined, { change });
      const target = focusCell(root, 0, 1);
      const event = await key(target, "7");
      expect(event.defaultPrevented).toBe(true);
      const input = cell(root, 0, 1).querySelector("input") as HTMLInputElement;
      expect(input.value).toBe("7");
      await key(input, "Enter");
      expect(change).toHaveBeenCalledWith(expect.anything(), "swim-oct", { amount: 7 });
    });

    it("leaves a shortcut and a computed cell alone when typing", async () => {
      const { root } = await opened(sourceOf([swim], false, rules));
      await key(focusCell(root, 0, 1), "c", { ctrlKey: true });
      expect(cell(root, 0, 1).querySelector("input")).toBeNull();
      await key(focusCell(root, 0, 2), "7");
      expect(cell(root, 0, 2).querySelector("input")).toBeNull();
    });

    it("empties a cell on Delete and Backspace", async () => {
      const change = vi.fn(async () => "saved" as const);
      const { root } = await opened(sourceOf([swim], false, rules), undefined, { change });
      await key(focusCell(root, 0, 1), "Delete");
      expect(change).toHaveBeenCalledWith(expect.anything(), "swim-oct", { amount: null });
      await key(focusCell(root, 0, 0), "Backspace");
      expect(change).toHaveBeenCalledTimes(2);
    });

    it("empties only what was typed in the new row, and adds nothing", async () => {
      const add = vi.fn(async () => {});
      const { root } = await opened(sourceOf([swim], false, rules), undefined, { add });
      const last = (column: number) => cell(root, 1, column);
      await key(focusCell(root, 1, 0), "x");
      await key(last(0).querySelector("input") as Element, "Tab");
      expect(last(0).textContent).toContain("x");
      await key(focusCell(root, 1, 0), "Delete");
      expect(last(0).textContent).not.toContain("x");
      expect(add).not.toHaveBeenCalled();
    });

    it("Home and End go to the row's first and last cell, Ctrl Home and Ctrl End to the grid's", async () => {
      const { root } = await opened(sourceOf([swim, trip], false, rules));
      await key(focusCell(root, 1, 1), "Home");
      expect(document.activeElement).toBe(cell(root, 1, 0));
      await key(document.activeElement as Element, "End");
      // The ⋮ button is the row's last cell.
      expect(document.activeElement).toBe(cell(root, 1, 3).querySelector("button"));
      await key(document.activeElement as Element, "Home", { ctrlKey: true });
      expect(document.activeElement).toBe(cell(root, 0, 0));
      await key(document.activeElement as Element, "End", { ctrlKey: true });
      // The new row has no ⋮: its last field.
      expect(document.activeElement).toBe(cell(root, 2, 2));
    });

    it("Page Down and Page Up move ten rows in the same column, and stop at the ends", async () => {
      const { root } = await opened(sourceOf(many, false, rules));
      await key(focusCell(root, 0, 1), "PageDown");
      expect(document.activeElement).toBe(cell(root, 10, 1));
      await key(document.activeElement as Element, "PageDown");
      await key(document.activeElement as Element, "PageDown");
      // 25 records and the new row: the new row is the last.
      expect(document.activeElement).toBe(cell(root, 25, 1));
      await key(document.activeElement as Element, "PageUp");
      expect(document.activeElement).toBe(cell(root, 15, 1));
    });

    it("Shift F10 opens the row's menu", async () => {
      const { root } = await opened(sourceOf([swim], false, rules));
      const open = vi.fn();
      const button = cell(root, 0, 3).querySelector("button") as HTMLButtonElement;
      button.addEventListener("click", open);
      const event = await key(focusCell(root, 0, 0), "F10", { shiftKey: true });
      expect(event.defaultPrevented).toBe(true);
      expect(open).toHaveBeenCalledTimes(1);
    });

    it("Enter saves and goes down; Tab saves and goes right", async () => {
      const change = vi.fn(async () => "saved" as const);
      const { root } = await opened(sourceOf([swim, trip], false, rules), undefined, { change });
      await key(focusCell(root, 0, 1), "Enter");
      await key(cell(root, 0, 1).querySelector("input") as Element, "Enter");
      expect(document.activeElement).toBe(cell(root, 1, 1));
      await key(focusCell(root, 0, 0), "Enter");
      await key(cell(root, 0, 0).querySelector("input") as Element, "Tab");
      expect(document.activeElement).toBe(cell(root, 0, 1));
      await key(cell(root, 0, 1), "Enter");
      await key(cell(root, 0, 1).querySelector("input") as Element, "Tab", { shiftKey: true });
      expect(document.activeElement).toBe(cell(root, 0, 0));
    });

    it("lets Tab leave the grid from its last cell, and keeps what was typed", async () => {
      const { root } = await opened(sourceOf([swim], false, rules, fields.slice(0, 2)));
      await key(focusCell(root, 1, 1), "9");
      const input = cell(root, 1, 1).querySelector("input") as HTMLInputElement;
      const next = await key(input, "Tab");
      expect(next.defaultPrevented).toBe(false);
      expect(document.activeElement).toBe(cell(root, 1, 1));
      expect(cell(root, 1, 1).textContent).toContain("9");
    });
  });

  describe("CollectionPage danger ring, announcements and empty states", () => {
    it("rings a cell that holds a message", async () => {
      const { root } = await opened(sourceOf([swim], false, rules));
      expect(cell(root, 0, 1).className).not.toContain("ring-danger");
      await key(focusCell(root, 0, 1), "l");
      await key(cell(root, 0, 1).querySelector("input") as Element, "Enter");
      expect(cell(root, 0, 1).className).toContain("ring-danger");
    });

    it("announces a removed record and moves focus to the row that took its place", async () => {
      const rows = [swim, trip];
      const { root } = await opened(sourceOf(rows, false, rules), undefined, {
        remove: async (_, id) => {
          rows.splice(
            rows.findIndex((row) => row.id === id),
            1,
          );
        },
      });
      const status = () => root.querySelector('[role="status"].sr-only')?.textContent;
      expect(status()).toBe("");
      const menu = cell(root, 0, 3).querySelector("button") as HTMLButtonElement;
      act(() => menu.focus());
      await pressButton(root, "Remove");
      await pressConfirm(root);
      expect(status()).toBe("Removed Swim lesson.");
      // The ⋮ column of the row that moved up.
      expect(document.activeElement).toBe(cell(root, 0, 3).querySelector("button"));
      expect(cell(root, 0, 0).textContent).toBe("Trip");
    });

    it("announces an added record and puts focus in the new row's first cell", async () => {
      const rows = [swim];
      const { root } = await opened(
        sourceOf(rows, false, {
          ...rules,
          newRow: (typed) => ({
            draft: typed,
            stillNeeded: [],
            record: { what: typed["what"] ?? "" },
          }),
        }),
        undefined,
        {
          add: async () => {
            rows.push(trip);
          },
        },
      );
      await key(focusCell(root, 1, 1), "5");
      await key(cell(root, 1, 1).querySelector("input") as Element, "Enter");
      expect(root.querySelector('[role="status"].sr-only')?.textContent).toBe("Added Trip.");
      expect(document.activeElement).toBe(cell(root, 2, 0));
    });

    it("says there are no records and offers Add record, which opens the new row", async () => {
      const { root } = await opened(sourceOf([], false, rules));
      expect(root.textContent).toContain("No records yet.");
      await pressButton(root, "Add record");
      expect(cell(root, 0, 0).querySelector("input")).not.toBeNull();
    });

    it("says no record is in a view that has none, without an Add record button", async () => {
      const { root } = await opened(sourceOf([], false, rules));
      const chip = [...root.querySelectorAll('[role="radiogroup"] label')].find((label) =>
        label.textContent?.startsWith("open"),
      ) as HTMLElement;
      await act(async () => chip.click());
      expect(root.textContent).toContain("No records match this view.");
      expect(root.textContent).not.toContain("Add record");
    });
  });
});
