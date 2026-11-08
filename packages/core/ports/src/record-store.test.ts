import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { compactedChanges, foldRecords, type RecordChange } from "./index.ts";

const change = (
  id: string,
  op: RecordChange["op"],
  values: RecordChange["values"],
  second: number,
): RecordChange => ({
  at: new Date(Date.UTC(2026, 0, 1, 0, 0, second)).toISOString(),
  collection: "leads",
  id,
  op,
  values,
});

verifies("ports.record-fold", () => {
  it("merges an update into the record and keeps the time of the last change", () => {
    const update = change("1", "update", { name: "Ada L." }, 2);
    const records = foldRecords([change("1", "add", { name: "Ada", city: "London" }, 1), update]);
    expect([...records]).toEqual([
      ["1", { values: { name: "Ada L.", city: "London" }, at: update.at }],
    ]);
  });

  it("starts over when a removed record is added again", () => {
    const records = foldRecords([
      change("1", "add", { name: "Ada", city: "London" }, 1),
      change("1", "remove", null, 2),
      change("1", "add", { name: "Grace" }, 3),
    ]);
    expect(records.get("1")?.values).toEqual({ name: "Grace" });
  });

  it("sets all values on a seed and drops a removed record", () => {
    const records = foldRecords([
      change("1", "seed", { name: "Ada" }, 1),
      change("2", "seed", { name: "Grace" }, 1),
      change("1", "seed", { city: "London" }, 2),
      change("2", "remove", null, 3),
    ]);
    expect([...records.keys()]).toEqual(["1"]);
    expect(records.get("1")?.values).toEqual({ city: "London" });
  });

  it("gives a fresh object for each record, so changing it leaves the changes alone", () => {
    const add = change("1", "add", { name: "Ada" }, 1);
    const records = foldRecords([add]);
    (records.get("1") as { values: Record<string, unknown> }).values["name"] = "changed";
    expect(add.values).toEqual({ name: "Ada" });
  });

  it("compacts to one seed per current record, without who made the changes", () => {
    const add = { ...change("1", "add", { name: "Ada", city: "London" }, 1), by: { person: "me" } };
    const update = change("1", "update", { name: "Ada L." }, 2);
    expect(
      compactedChanges("leads", [
        add,
        update,
        change("2", "seed", {}, 3),
        change("2", "remove", null, 4),
      ]),
    ).toEqual([
      {
        at: update.at,
        collection: "leads",
        id: "1",
        op: "seed",
        values: { name: "Ada L.", city: "London" },
      },
    ]);
  });
});
