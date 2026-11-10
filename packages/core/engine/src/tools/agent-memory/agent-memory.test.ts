import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { steppingClock } from "../../agent/turn-test-kit.test-helper.ts";
import { AgentMemory, agentMemoryCollection, maxNoteText } from "./agent-memory.ts";
import { memoryRecords } from "./memory-records.test-helper.ts";

function memoryOf(agentId: string, records = memoryRecords(), runId?: string) {
  const memory = new AgentMemory({
    records,
    clock: steppingClock(),
    agentId,
    ...(runId === undefined ? {} : { runId }),
  });
  return { memory, records };
}

verifies("engine.agent-memory-records", () => {
  it("keeps a note in the agent's collection, stamped and naming the agent", async () => {
    const { memory, records } = memoryOf("clerk");

    const note = await memory.save("Refunds", "Ask for the order number");

    expect(note).toEqual({
      title: "Refunds",
      text: "Ask for the order number",
      at: "2026-01-05T09:00:00.000Z",
    });
    expect(records.log).toEqual([
      {
        at: "2026-01-05T09:00:00.000Z",
        collection: "agent-memory/clerk",
        id: "refunds",
        op: "add",
        values: { title: "Refunds", text: "Ask for the order number" },
        by: { agent: "clerk" },
      },
    ]);
    expect(await memory.notes()).toEqual([note]);
  });

  it("replaces a note saved again under its title, ignoring case and spaces", async () => {
    const { memory, records } = memoryOf("clerk", memoryRecords(), "run-1");
    await memory.save("Refunds", "Ask for the order number");

    await memory.save(" refunds ", "Check the date first");

    expect(records.log.map((change) => change.op)).toEqual(["add", "update"]);
    expect(records.log[1]?.by).toEqual({ agent: "clerk", runId: "run-1" });
    expect(await memory.notes()).toEqual([
      { title: "refunds", text: "Check the date first", at: "2026-01-05T09:00:00.250Z" },
    ]);
  });

  it("forgets a note and says whether there was one", async () => {
    const { memory, records } = memoryOf("clerk");
    await memory.save("Refunds", "Ask for the order number");

    expect(await memory.forget("REFUNDS")).toBe(true);
    expect(await memory.forget("Refunds")).toBe(false);
    expect(records.log.map((change) => change.op)).toEqual(["add", "remove"]);
    expect(await memory.notes()).toEqual([]);
  });

  it("keeps each agent's notes apart, listed by title", async () => {
    const records = memoryRecords();
    const clerk = memoryOf("clerk", records).memory;
    await clerk.save("Shipping", "Two days");
    await clerk.save("Billing", "Monthly");

    expect((await clerk.notes()).map((note) => note.title)).toEqual(["Billing", "Shipping"]);
    expect(await memoryOf("scout", records).memory.notes()).toEqual([]);
  });

  it("leaves out a record that isn't a note", async () => {
    const { memory, records } = memoryOf("clerk");
    await records.append([
      {
        at: "2026-01-05T08:00:00.000Z",
        collection: "agent-memory/clerk",
        id: "x",
        op: "add",
        values: { title: 3 },
      },
    ]);

    expect(await memory.notes()).toEqual([]);
  });

  it("refuses an empty or long title and a long text, writing nothing", async () => {
    const { memory, records } = memoryOf("clerk");

    await expect(memory.save("  ", "text")).rejects.toThrow(RangeError);
    await expect(memory.save("t".repeat(121), "text")).rejects.toThrow(RangeError);
    await expect(memory.save("Long", "x".repeat(maxNoteText + 1))).rejects.toThrow(RangeError);
    await memory.save("t".repeat(120), "x".repeat(maxNoteText));
    expect(records.log).toHaveLength(1);
  });

  it("needs an agent id", () => {
    expect(agentMemoryCollection("clerk")).toBe("agent-memory/clerk");
    expect(() => agentMemoryCollection("")).toThrow(RangeError);
  });
});
