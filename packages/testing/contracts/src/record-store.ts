import type { RecordChange, RecordStore } from "@halonicjs/ports";
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
  describe(`RecordStore contract (contracts.record-store): ${name}`, () => {
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
      expect(await store.changes("leads")).toEqual([change("leads", "1", "add", { name: "Ada" })]);
    });
  });
}
