import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { steppingClock } from "../../agent/turn-test-kit.test-helper.ts";
import {
  AgentMemory,
  agentMemoryCollection,
  maxMemoryText,
  maxNotes,
  maxNoteText,
} from "./agent-memory.ts";
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

    expect(await memory.forget("REFUNDS")).toBe("Refunds");
    expect(await memory.forget("Refunds")).toBeUndefined();
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

  it("lists titles by code point, whatever the host's language", async () => {
    const { memory } = memoryOf("clerk");
    for (const title of ["\u{1F600} smile", "\uFB01 ligature", "apple", "Zebra", "\u00C9clair"]) {
      await memory.save(title, "text");
    }

    expect((await memory.notes()).map((note) => note.title)).toEqual([
      "Zebra",
      "apple",
      "\u00C9clair",
      "\uFB01 ligature",
      "\u{1F600} smile",
    ]);
  });

  it("refuses a new title past the most notes, but still replaces one", async () => {
    const { memory, records } = memoryOf("clerk");
    for (let i = 0; i < maxNotes; i++) {
      await memory.save(`Note ${i}`, "text");
    }

    await expect(memory.save("One more", "text")).rejects.toThrow(
      `You already keep ${maxNotes} notes, the most allowed. Forget a note you no longer need`,
    );
    expect(records.log).toHaveLength(maxNotes);
    await memory.save("note 7", "new text");
    expect(records.log.at(-1)?.op).toBe("update");
    await memory.forget("Note 0");
    await memory.save("One more", "text");
    expect(await memory.notes()).toHaveLength(maxNotes);
  });

  it("refuses a save that takes the texts together past the limit", async () => {
    const { memory, records } = memoryOf("clerk");
    const quarter = maxMemoryText / 4;
    for (const title of ["A", "B", "C", "D"]) {
      await memory.save(title, "x".repeat(quarter));
    }

    await expect(memory.save("E", "x")).rejects.toThrow(
      `Your notes would hold ${maxMemoryText + 1} characters, more than the ${maxMemoryText} allowed.`,
    );
    expect(records.log).toHaveLength(4);
    await memory.save("a", "y".repeat(quarter));
    await memory.save("a", "short");
    await memory.save("E", "x".repeat(quarter - 5));
    expect(records.log).toHaveLength(7);
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
