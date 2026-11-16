import { ManualClock, MemoryRecordStore } from "@halonicjs/adapter-memory";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { WorkspaceCollections } from "./workspace-collections.ts";

const claims = `id: claims
name: Claims
fields:
  what: { type: text, required: true }
  amount: { type: money, required: true }
  sharePct: { type: number, default: 100 }
  share: { type: money, compute: "amount * sharePct / 100" }
views:
  open: { where: { what: swim }, total: share }
seed:
  - { id: swim-oct, what: swim, amount: 45 }
  - { id: trip, what: trip, amount: 20 }
`;

function setup() {
  const store: Record<string, string> = {
    "workspace.yaml": "id: acme\nname: Acme\n",
    "library/collections/claims.collection.yaml": claims,
    "agents/helper.agent.yaml": "id: helper\nname: Helper\ncollections: [claims]\nmodel: test\n",
  };
  const records = new MemoryRecordStore();
  const listeners = new Set<() => void>();
  const host = new WorkspaceCollections({
    files: {
      read: async (path) => store[path] ?? null,
      list: async (dir) =>
        Object.keys(store)
          .filter((path) => path.startsWith(`${dir}/`))
          .sort(),
    },
    onChange: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    records,
    clock: new ManualClock("2026-11-16T10:00:00Z"),
  });
  return { host, records, listeners };
}

const ref = { hub: null, id: "claims" };

verifies("library.collection-page", () => {
  it("reads the columns, the chips with totals and the rows, seed records included", async () => {
    const { host } = setup();
    const source = await host.read(ref);
    expect(source?.name).toBe("Claims");
    expect(source?.volatile).toBe(false);
    const grid = source?.grid(null);
    expect(grid?.fields.map((field) => field.name)).toEqual([
      "what",
      "amount",
      "sharePct",
      "share",
    ]);
    expect(grid?.views).toEqual([
      { view: null, count: 2 },
      { view: "open", count: 1, total: 45 },
    ]);
    expect(source?.grid("open").rows.map((row) => row.id)).toEqual(["swim-oct"]);
  });

  it("reads none for a collection that is missing", async () => {
    expect(await setup().host.read({ hub: null, id: "nope" })).toBeUndefined();
  });

  it("changes a record as the person you, and tells listeners", async () => {
    const { host, records } = setup();
    let heard = 0;
    host.subscribe(() => heard++);
    expect(await host.change(ref, "swim-oct", { amount: 65 })).toBe("saved");
    const last = (await records.changes("claims")).at(-1);
    expect(last).toMatchObject({
      op: "update",
      id: "swim-oct",
      values: { amount: 65 },
      by: { person: "you" },
    });
    expect(heard).toBe(1);
    expect((await host.read(ref))?.grid(null).rows[0]?.values["amount"]).toBe(65);
  });

  it("says a record is removed and writes nothing when it is gone", async () => {
    const { host, records } = setup();
    await host.remove(ref, "trip");
    const before = (await records.changes("claims")).length;
    expect(await host.change(ref, "trip", { amount: 1 })).toBe("removed");
    expect((await records.changes("claims")).length).toBe(before);
  });

  it("adds a record and removes one, and a removed seed record stays removed", async () => {
    const { host } = setup();
    await host.add(ref, { what: "books", amount: 12 });
    await host.remove(ref, "trip");
    const rows = (await host.read(ref))?.grid(null).rows ?? [];
    expect(rows.map((row) => row.values["what"])).toEqual(["swim", "books"]);
  });

  it("refuses a value the field doesn't accept", async () => {
    const { host } = setup();
    await expect(host.change(ref, "swim-oct", { amount: "lots" })).rejects.toThrow("amount");
  });

  it("says which agents use the collection", async () => {
    const usage = await setup().host.usage(ref);
    expect(usage.agents.map((agent) => agent.id)).toEqual(["helper"]);
  });

  it("tells a listener when files change, until it stops", () => {
    const { host, listeners } = setup();
    const stop = host.subscribe(() => undefined);
    expect(listeners.size).toBe(1);
    stop();
    expect(listeners.size).toBe(0);
  });
});
