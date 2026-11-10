import type { Collection } from "@halonicjs/format";
import type { RecordChange, RecordStore } from "@halonicjs/ports";
import { fixedClock } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { checkRunToolCall } from "../../agent/check-run-tool-call.ts";
import type { HalonicTool, TurnTool } from "../../agent/turn-tools.ts";
import { recordTools } from "./record-tools.ts";
import { invoices } from "./records-test-kit.test-helper.ts";

const now = Date.parse("2026-11-10T09:00:00.000Z");

/** A record store in memory that keeps every change. */
class MemoryRecords implements RecordStore {
  readonly log: RecordChange[] = [];

  async append(changes: readonly RecordChange[]): Promise<void> {
    this.log.push(...structuredClone([...changes]));
  }

  async changes(collection: string): Promise<RecordChange[]> {
    return structuredClone(this.log.filter((change) => change.collection === collection));
  }

  async compact(): Promise<void> {}
}

const seeded: Collection = {
  ...invoices,
  id: "acme.invoices",
  seed: [{ id: "inv-1", supplier: "sup-1", amount: "100", sharePct: 50, status: "open" }],
};

function toolsFor(records: MemoryRecords, collectionIds = ["acme.invoices"]) {
  const tools = recordTools({
    collectionIds,
    collections: { "acme.invoices": seeded },
    records,
    clock: fixedClock(now, 0),
    agent: "clerk",
    runId: "r-1",
  });
  const byName = new Map(tools.map((tool) => [tool.definition.name, tool]));
  const tool = (name: string): HalonicTool => {
    const found = byName.get(name);
    if (found === undefined) {
      throw new Error(`no tool ${name}`);
    }
    return found;
  };
  return {
    tools,
    find: tool("find_acme_invoices"),
    add: tool("add_acme_invoices"),
    update: tool("update_acme_invoices"),
  };
}

async function json(tool: HalonicTool, args: Record<string, unknown>): Promise<unknown> {
  return JSON.parse(await tool.run(args));
}

verifies("engine.record-tools", () => {
  describe("recordTools", () => {
    it("offers find, add and update for each collection the hub can see", () => {
      const { tools } = toolsFor(new MemoryRecords(), ["acme.invoices", "missing"]);

      expect(tools.map((tool) => tool.definition.name)).toEqual([
        "find_acme_invoices",
        "add_acme_invoices",
        "update_acme_invoices",
      ]);
      const [find, add] = tools;
      expect(find?.definition.description).toContain(
        "Fields: supplier (ref), note (text), amount (money), sharePct (number), share (money, computed), due (date), period (month), status (choice: open/paid), disputed (boolean). Views: open, all.",
      );
      expect(add?.definition.parameters).toMatchObject({
        properties: {
          id: { type: "string" },
          supplier: { type: "string", description: "id in suppliers" },
          amount: { type: "number", description: "amount" },
          status: { type: "string", enum: ["open", "paid"] },
          disputed: { type: "boolean" },
        },
        required: ["supplier", "amount"],
      });
      expect(add?.definition.parameters["properties"]).not.toHaveProperty("share");
    });

    it.each([
      [
        "find",
        { where: { status: "open", amount: { gte: 10 }, due: null }, view: "open", limit: 5 },
      ],
      ["add", { id: "inv-2", supplier: "sup-2", amount: 1, status: "paid" }],
      ["update", { id: "inv-1", values: { status: "paid", note: "done" } }],
    ] as const)("lets a run's call check through a %s with %j", (toolName, args) => {
      const tool = toolsFor(new MemoryRecords())[toolName];
      const turnTool: TurnTool = {
        kind: "halonic",
        source: "halonic",
        definition: tool.definition,
        tool,
      };
      const call = { id: "c-1", name: tool.definition.name, arguments: args };

      expect(checkRunToolCall(turnTool, call)).toEqual({ kind: "run" });
    });

    it("gives no tools for a collection id that is only an inherited object key", () => {
      const tools = recordTools({
        collectionIds: ["constructor", "toString"],
        collections: {},
        records: new MemoryRecords(),
        clock: fixedClock(now, 0),
        agent: "clerk",
      });

      expect(tools).toEqual([]);
    });

    it("adds the seed records once, before the first read", async () => {
      const records = new MemoryRecords();
      const { find } = toolsFor(records);

      const found = await json(find, {});
      await json(find, {});

      expect(found).toEqual({
        records: [
          {
            id: "inv-1",
            values: { supplier: "sup-1", amount: 100, sharePct: 50, share: 50, status: "open" },
            updatedAt: "2026-11-10T09:00:00.000Z",
          },
        ],
      });
      expect(records.log.map((change) => change.op)).toEqual(["seed"]);
    });

    it("doesn't bring back a seed record that was removed", async () => {
      const records = new MemoryRecords();
      records.log.push({
        at: "2026-11-01T09:00:00.000Z",
        collection: "acme.invoices",
        id: "inv-1",
        op: "remove",
        values: null,
      });

      expect(await json(toolsFor(records).find, {})).toEqual({ records: [] });
    });

    it("adds and updates records, logging the agent and the run", async () => {
      const records = new MemoryRecords();
      const { add, update, find } = toolsFor(records);

      const added = await json(add, { supplier: "sup-2", amount: 40, status: "open" });
      const updated = await json(update, { id: "inv-1", values: { status: "paid" } });

      expect(added).toMatchObject({
        id: "acme.invoices-mwagluo0-2",
        values: { amount: 40, share: 40 },
      });
      expect(updated).toMatchObject({ id: "inv-1", values: { status: "paid", amount: 100 } });
      expect(records.log.slice(1).map(({ op, by }) => ({ op, by }))).toEqual([
        { op: "add", by: { agent: "clerk", runId: "r-1" } },
        { op: "update", by: { agent: "clerk", runId: "r-1" } },
      ]);
      expect(await json(find, { where: { status: "open" } })).toMatchObject({
        records: [{ id: "acme.invoices-mwagluo0-2" }],
      });
    });

    it("finds through a view, with its total, up to the limit", async () => {
      const records = new MemoryRecords();
      const { add, find } = toolsFor(records);
      await add.run({
        id: "inv-2",
        supplier: "sup-2",
        amount: 0.5,
        status: "open",
        due: "2026-10-01",
      });

      expect(await json(find, { view: "open" })).toMatchObject({
        total: 100.5,
        records: [{ id: "inv-1" }, { id: "inv-2" }],
      });
      expect(await json(find, { view: "open", limit: 1 })).toMatchObject({
        records: [{ id: "inv-1" }],
      });
    });

    it.each([
      ["add", { supplier: "sup-2", amount: "lots" }, '"amount" must be a number (got "lots")'],
      [
        "add",
        { id: "inv-1", supplier: "sup-2", amount: 1 },
        'A record "inv-1" already exists in acme.invoices',
      ],
      ["update", { id: "inv-9", values: { status: "paid" } }, 'No record "inv-9" in acme.invoices'],
      ["update", { id: "inv-1", values: { share: 3 } }, '"share" is computed and cannot be set'],
      ["update", { id: "inv-1" }, '"values" is required'],
      ["update", { id: "inv-1", values: [1] }, '"values" must be an object (got [1])'],
      [
        "find",
        { view: "late" },
        'Collection "acme.invoices" has no view "late" (views: open, all)',
      ],
      [
        "find",
        { view: "constructor" },
        'Collection "acme.invoices" has no view "constructor" (views: open, all)',
      ],
      ["add", { id: 123, supplier: "sup-2", amount: 1 }, '"id" must be a string (got 123)'],
      [
        "add",
        { id: " ", supplier: "sup-2", amount: 1 },
        '"id" must not be blank or start or end with a space (got " ")',
      ],
      [
        "add",
        { id: "inv-2 ", supplier: "sup-2", amount: 1 },
        '"id" must not be blank or start or end with a space (got "inv-2 ")',
      ],
      ["find", { where: "open" }, '"where" must be an object (got "open")'],
      ["find", { limit: 500 }, '"limit" must be from 1 to 200 (got 500)'],
    ] as const)("refuses a %s with %j and changes nothing", async (toolName, args, message) => {
      const records = new MemoryRecords();
      const tools = toolsFor(records);
      await tools.find.run({});

      await expect(tools[toolName].run(args)).rejects.toThrow(message);
      expect(records.log.map((change) => change.op)).toEqual(["seed"]);
    });
  });
});
