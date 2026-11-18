// @vitest-environment jsdom
import { settlePendingSaves } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  amountEdit,
  cell,
  cleanUp,
  leave,
  meal,
  opened,
  pick,
  press,
  rich,
  richEdit,
  richFields,
  sourceOf,
  swim,
  trip,
  typeInto,
} from "../test-support/collection-page.tsx";

afterEach(cleanUp);

verifies("library.collection-page", () => {
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

    it("registers a cell's save with the window close until the change is written", async () => {
      let release: (outcome: "saved") => void = () => undefined;
      const change = vi.fn(() => new Promise<"saved">((resolve) => (release = resolve)));
      const { root } = await opened(sourceOf([swim], false, { editCell: amountEdit }), undefined, {
        change,
      });
      await typeInto(root, 0, 1, "65");
      let done = false;
      const waiting = settlePendingSaves().then(() => {
        done = true;
      });
      await new Promise((resolve) => setTimeout(resolve, 5));
      expect(done).toBe(false);

      release("saved");
      await waiting;

      expect(done).toBe(true);
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
  });
});
