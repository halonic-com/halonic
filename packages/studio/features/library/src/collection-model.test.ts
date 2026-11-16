import type { ItemUsage } from "@halonicjs/app";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it, vi } from "vitest";
import type {
  CollectionColumn,
  CollectionHost,
  CollectionRow,
  CollectionSource,
} from "./collection-host.ts";
import { CollectionModel } from "./collection-model.ts";

const noUsage: ItemUsage = { agents: [], hubs: [], routines: [], collections: [] };
const ref = { hub: null, id: "claims" };

const fields: CollectionColumn[] = [
  { name: "what", type: "text", required: true, computed: false, choices: [] },
  { name: "amount", type: "money", required: true, computed: false, choices: [] },
  { name: "decision", type: "choice", required: false, computed: false, choices: ["yes", "no"] },
];

const swim: CollectionRow = { id: "swim-oct", values: { what: "Swim lesson", amount: 60 } };
const trip: CollectionRow = {
  id: "trip",
  values: { what: "Trip", amount: 20, decision: "yes" },
};

/** A source that answers like the engine's helpers do, for the claims collection. */
function sourceOf(rows: CollectionRow[], volatile = false): CollectionSource {
  const open = (list: readonly CollectionRow[]) =>
    list.filter((row) => row.values["decision"] === undefined);
  return {
    name: "Claims",
    volatile,
    grid: (view) => ({
      fields,
      views: [
        { view: null, count: rows.length },
        { view: "open", count: open(rows).length, total: 60 },
      ],
      rows: view === "open" ? open(rows) : rows,
    }),
    editCell: (field, text) => {
      const number = Number(text);
      if (field === "amount" && Number.isNaN(number)) {
        return { ok: false, message: `"amount" must be a number (got "${text}")` };
      }
      const value = field === "amount" ? number : text;
      return { ok: true, values: { [field]: text === "" ? null : value } };
    },
    newRow: (typed) => {
      const stillNeeded = ["what", "amount"].filter((name) => (typed[name] ?? "") === "");
      return stillNeeded.length > 0
        ? { draft: typed, stillNeeded }
        : {
            draft: typed,
            stillNeeded,
            record: { what: typed["what"], amount: Number(typed["amount"]) },
          };
    },
  };
}

function hostOf(rows: CollectionRow[] | undefined, overrides: Partial<CollectionHost> = {}) {
  const host: CollectionHost = {
    read: async () => (rows === undefined ? undefined : sourceOf(rows)),
    change: vi.fn(async () => "saved" as const),
    add: vi.fn(async () => {}),
    remove: vi.fn(async () => {}),
    rename: vi.fn(async () => {}),
    usage: async () => noUsage,
    subscribe: () => () => {},
    ...overrides,
  };
  return host;
}

async function opened(rows: CollectionRow[] | undefined, overrides: Partial<CollectionHost> = {}) {
  const host = hostOf(rows, overrides);
  const model = new CollectionModel(host, ref);
  await model.refresh();
  return { model, host };
}

verifies("library.collection-page", () => {
  describe("CollectionModel", () => {
    it("reads the chips and the records of All", async () => {
      const { model } = await opened([swim, trip]);
      expect(model.state.name).toBe("Claims");
      expect(model.state.grid?.views).toEqual([
        { view: null, count: 2 },
        { view: "open", count: 1, total: 60 },
      ]);
      expect(model.state.grid?.rows).toHaveLength(2);
    });

    it("shows only the chosen view's records, and all for a view that isn't there", async () => {
      const { model } = await opened([swim, trip]);
      model.chooseView("open");
      expect(model.state.grid?.rows.map((row) => row.id)).toEqual(["swim-oct"]);
      model.chooseView("gone");
      expect(model.state.view).toBeNull();
      expect(model.state.grid?.rows).toHaveLength(2);
    });

    it("says the collection is gone when the host has none", async () => {
      const { model } = await opened(undefined);
      expect(model.state).toMatchObject({ loaded: true, gone: true });
    });

    it("carries the demo flag", async () => {
      const host = hostOf([swim], { read: async () => sourceOf([swim], true) });
      const model = new CollectionModel(host, ref);
      await model.refresh();
      expect(model.state.volatile).toBe(true);
    });

    it("saves an edited cell once as a change of that field", async () => {
      const { model, host } = await opened([swim]);
      expect(await model.saveCell("swim-oct", "amount", "65")).toBe(true);
      expect(host.change).toHaveBeenCalledOnce();
      expect(host.change).toHaveBeenCalledWith(ref, "swim-oct", { amount: 65 });
    });

    it("saves an emptied cell as null", async () => {
      const { model, host } = await opened([trip]);
      await model.saveCell("trip", "decision", "");
      expect(host.change).toHaveBeenCalledWith(ref, "trip", { decision: null });
    });

    it("writes nothing for an unchanged cell", async () => {
      const { model, host } = await opened([swim]);
      expect(await model.saveCell("swim-oct", "amount", "60")).toBe(true);
      expect(host.change).not.toHaveBeenCalled();
    });

    it("writes nothing for a value the field doesn't accept and shows the message until the next edit", async () => {
      const { model, host } = await opened([swim]);
      expect(await model.saveCell("swim-oct", "amount", "lots")).toBe(false);
      expect(host.change).not.toHaveBeenCalled();
      expect(model.state.cellError).toEqual({
        row: "swim-oct",
        field: "amount",
        message: '"amount" must be a number (got "lots")',
      });
      model.editing("swim-oct", "what");
      expect(model.state.cellError).toBeDefined();
      model.editing("swim-oct", "amount");
      expect(model.state.cellError).toBeUndefined();
    });

    it("says the row was removed by another change and keeps the rest", async () => {
      const { model } = await opened([swim, trip], { change: async () => "removed" });
      expect(await model.saveCell("swim-oct", "amount", "65")).toBe(false);
      expect(model.state.rowRemoved).toBe(true);
      expect(model.state.grid?.rows).toHaveLength(2);
      model.editing("trip", "amount");
      expect(model.state.rowRemoved).toBe(false);
    });

    it("says the row was removed when it is no longer in the grid", async () => {
      const { model, host } = await opened([swim]);
      expect(await model.saveCell("other", "amount", "65")).toBe(false);
      expect(model.state.rowRemoved).toBe(true);
      expect(host.change).not.toHaveBeenCalled();
    });

    it("keeps the typed text of the new row and adds nothing while a required field is empty", async () => {
      const { model, host } = await opened([swim]);
      model.typeNew("what", "School trip");
      expect(model.newRow()?.stillNeeded).toEqual(["amount"]);
      expect(await model.addNew()).toBe("needs-more");
      expect(host.add).not.toHaveBeenCalled();
      expect(model.state.typed).toEqual({ what: "School trip" });
    });

    it("adds the record when every required field is filled and empties the row", async () => {
      const { model, host } = await opened([swim]);
      model.typeNew("what", "School trip");
      model.typeNew("amount", "20");
      expect(await model.addNew()).toBe("added");
      expect(host.add).toHaveBeenCalledWith(ref, { what: "School trip", amount: 20 });
      expect(model.state.typed).toEqual({});
    });

    it("adds once when addNew is called twice before the add finishes", async () => {
      let finish = () => {};
      const { model, host } = await opened([swim], {
        add: vi.fn(
          () =>
            new Promise<void>((resolve) => {
              finish = resolve;
            }),
        ),
      });
      model.typeNew("what", "School trip");
      model.typeNew("amount", "20");
      const first = model.addNew();
      const second = model.addNew();
      finish();
      expect(await first).toBe("added");
      expect(await second).toBe("added");
      expect(host.add).toHaveBeenCalledTimes(1);
    });

    it("keeps text typed into the new row while the add is pending", async () => {
      let finish = () => {};
      const { model } = await opened([swim], {
        add: () =>
          new Promise<void>((resolve) => {
            finish = resolve;
          }),
      });
      model.typeNew("what", "School trip");
      model.typeNew("amount", "20");
      const adding = model.addNew();
      model.typeNew("what", "Museum");
      finish();
      await adding;
      expect(model.state.typed).toEqual({ what: "Museum" });
    });

    it("refuses a value the field doesn't accept and adds nothing", async () => {
      const host = hostOf([swim]);
      const source = sourceOf([swim]);
      host.read = async () => ({
        ...source,
        newRow: (typed) => ({ draft: typed, stillNeeded: [], message: "bad amount" }),
      });
      const model = new CollectionModel(host, ref);
      await model.refresh();
      expect(await model.addNew()).toBe("refused");
      expect(host.add).not.toHaveBeenCalled();
    });

    it("says the first read failed while nothing has loaded", async () => {
      const model = new CollectionModel(
        hostOf([swim], {
          read: async () => {
            throw new Error("unreadable");
          },
        }),
        ref,
      );
      await model.refresh();
      expect(model.state).toMatchObject({ loaded: false, failed: true });
      expect(model.state.failureReason).toBeUndefined();
    });

    it("keeps the new row when the write fails", async () => {
      const { model } = await opened([swim], {
        add: async () => {
          throw new Error("disk full");
        },
      });
      model.typeNew("what", "School trip");
      model.typeNew("amount", "20");
      expect(await model.addNew()).toBe("failed");
      expect(model.state.typed).toEqual({ what: "School trip", amount: "20" });
    });

    it("removes a record through the host", async () => {
      const { model, host } = await opened([swim]);
      expect(await model.remove("swim-oct")).toBe(true);
      expect(host.remove).toHaveBeenCalledWith(ref, "swim-oct");
    });

    it("refreshes when the host says records changed, and stops watching with the last listener", async () => {
      let notify = () => {};
      const stop = vi.fn();
      const rows = [swim];
      const host = hostOf(rows, {
        subscribe: (listener) => {
          notify = listener;
          return stop;
        },
      });
      const model = new CollectionModel(host, ref);
      const unsubscribe = model.subscribe(() => {});
      await vi.waitFor(() => expect(model.state.loaded).toBe(true));
      rows.push(trip);
      notify();
      await vi.waitFor(() => expect(model.state.grid?.rows).toHaveLength(2));
      unsubscribe();
      expect(stop).toHaveBeenCalledOnce();
    });
  });
});
