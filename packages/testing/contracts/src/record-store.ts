import { foldRecords, type RecordChange, type RecordStore } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";

/** Creates an empty store under test. */
export type MakeRecordStore = () => Promise<RecordStore>;

const change = (
  collection: string,
  id: string,
  op: RecordChange["op"],
  values: RecordChange["values"],
  second = 0,
): RecordChange => ({
  at: new Date(Date.UTC(2026, 0, 1, 0, 0, second)).toISOString(),
  collection,
  id,
  op,
  values,
});

/** The contract every {@link RecordStore} adapter passes. */
export function recordStoreContract(name: string, make: MakeRecordStore): void {
  verifies("contracts.record-store", () => {
    describe(`RecordStore contract: ${name}`, () => {
      it("gives every change to a collection, oldest first, as appended", async () => {
        const store = await make();
        const add = { ...change("leads", "1", "add", { name: "Ada" }, 1), by: { runId: "r1" } };
        const update = change("leads", "1", "update", { name: "Ada L." }, 2);
        const remove = { ...change("leads", "1", "remove", null, 3), by: { person: "me" } };
        await store.append([add]);
        await store.append([update, remove]);
        expect(await store.changes("leads")).toEqual([add, update, remove]);
      });

      it("keeps collections apart, also within one call", async () => {
        const store = await make();
        const seed = change("orders", "a", "seed", { total: 1 });
        const lead = change("leads", "1", "add", { name: "Ada" });
        await store.append([seed, lead, change("orders", "b", "add", { total: 2 })]);
        expect((await store.changes("orders")).map((entry) => entry.id)).toEqual(["a", "b"]);
        expect(await store.changes("leads")).toEqual([lead]);
        expect(await store.changes("unknown")).toEqual([]);
      });

      it("treats a collection name as a value, not a path or a table", async () => {
        const store = await make();
        const odd = ["../leads", "leads; DROP TABLE x", "Leads", "leads/2"];
        for (const collection of odd) {
          await store.append([change(collection, "1", "add", { collection })]);
        }
        for (const collection of odd) {
          expect(await store.changes(collection), collection).toEqual([
            change(collection, "1", "add", { collection }),
          ]);
        }
        expect(await store.changes("leads")).toEqual([]);
      });

      it("keeps its own copy of the changes", async () => {
        const store = await make();
        const values = { name: "Ada" };
        await store.append([change("leads", "1", "add", values)]);
        values.name = "changed";
        const read = await store.changes("leads");
        (read[0] as RecordChange).id = "changed";
        expect(await store.changes("leads")).toEqual([
          change("leads", "1", "add", { name: "Ada" }),
        ]);
      });

      it("compacts a collection to one seed per current record", async () => {
        const store = await make();
        await store.append(changesToCompact);
        await store.compact("leads");
        const compacted = await store.changes("leads");
        expect(sortedById(compacted)).toEqual([
          change("leads", "1", "seed", { name: "Ada L.", city: "London" }, 2),
          change("leads", "3", "seed", { name: "Edsger" }, 5),
        ]);
      });

      it("leaves no overwritten or removed value after compacting", async () => {
        const store = await make();
        await store.append(changesToCompact);
        await store.compact("leads");
        const text = JSON.stringify(await store.changes("leads"));
        for (const gone of ["old-name-of-1", "removed-record-2", "removed-person"]) {
          expect(text).not.toContain(gone);
        }
      });

      it("folds changes appended after a compact onto the seeds", async () => {
        const store = await make();
        await store.append(changesToCompact);
        await store.compact("leads");
        await store.append([
          change("leads", "1", "update", { city: "Paris" }, 6),
          change("leads", "4", "add", { name: "Barbara" }, 7),
        ]);
        const records = foldRecords(await store.changes("leads"));
        expect(Object.fromEntries([...records].map(([id, record]) => [id, record.values]))).toEqual(
          {
            "1": { name: "Ada L.", city: "Paris" },
            "3": { name: "Edsger" },
            "4": { name: "Barbara" },
          },
        );
      });

      it("compacts only the collection it is given", async () => {
        const store = await make();
        const orders = [
          change("orders", "a", "add", { total: 1 }, 1),
          change("orders", "a", "update", { total: 2 }, 2),
          change("orders", "b", "remove", null, 3),
        ];
        await store.append([...changesToCompact, ...orders]);
        await store.compact("leads");
        await store.compact("unknown");
        expect(await store.changes("orders")).toEqual(orders);
        expect(await store.changes("unknown")).toEqual([]);
      });
    });
  });
}

/**
 * Changes to `leads`, oldest first: record 1 is added and updated, record 2
 * added and removed, record 3 seeded. The values that must not survive a
 * compact are marked so a test can search for them.
 */
const changesToCompact: readonly RecordChange[] = [
  {
    ...change("leads", "1", "add", { name: "old-name-of-1", city: "London" }, 1),
    by: { runId: "r1" },
  },
  { ...change("leads", "1", "update", { name: "Ada L." }, 2), by: { person: "me" } },
  change("leads", "2", "add", { name: "removed-record-2" }, 3),
  { ...change("leads", "2", "remove", null, 4), by: { person: "removed-person" } },
  change("leads", "3", "seed", { name: "Edsger" }, 5),
];

const sortedById = (changes: readonly RecordChange[]): RecordChange[] =>
  [...changes].sort((left, right) => left.id.localeCompare(right.id));
