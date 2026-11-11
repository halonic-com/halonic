import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { formatRecordLines, parseRecordLines, type RecordChange } from "./index.ts";

function added(collection: string, id: string): RecordChange {
  return { at: "2026-01-01T00:00:00.000Z", collection, id, op: "add", values: { name: id } };
}

// The record stores of fs-node and fs-tauri use these rules on real files; this checks them on their own.
verifies("ports.record-log-files", () => {
  describe("formatRecordLines and parseRecordLines", () => {
    it("reads back what formatRecordLines writes, one change per line", () => {
      const changes = [
        added("leads", "1"),
        { ...added("leads", "1"), op: "remove" as const, values: null },
      ];
      const lines = formatRecordLines(changes);
      expect(lines.split("\n")).toHaveLength(3);
      expect(parseRecordLines(lines, "leads", "leads.jsonl")).toEqual(changes);
    });

    it("reads an empty log as no changes", () => {
      expect(parseRecordLines("", "leads", "leads.jsonl")).toEqual([]);
    });

    it("refuses text that doesn't end in a line break, which the adapter cuts off first", () => {
      const torn = `${formatRecordLines([added("leads", "1")])}${JSON.stringify(added("leads", "2"))}`;
      expect(() => parseRecordLines(torn, "leads", "leads.jsonl")).toThrow(RangeError);
    });

    it("names the file and line of a line that isn't JSON", () => {
      const lines = `${formatRecordLines([added("leads", "1")])}{"not JSON\n`;
      expect(() => parseRecordLines(lines, "leads", "leads.jsonl")).toThrow(
        'Broken record log "leads.jsonl", line 2: it is not JSON.',
      );
    });

    it.each([
      ["an array", "[]"],
      ["an unknown op", JSON.stringify({ ...added("leads", "1"), op: "drop" })],
      ["values that are a list", JSON.stringify({ ...added("leads", "1"), values: [] })],
      ["a by that is text", JSON.stringify({ ...added("leads", "1"), by: "ada" })],
      ["an id that is a number", JSON.stringify({ ...added("leads", "1"), id: 1 })],
    ])("names the file and line of a line with %s", (_, line) => {
      expect(() => parseRecordLines(`${line}\n`, "leads", "leads.jsonl")).toThrow(
        'Broken record log "leads.jsonl", line 1: it is not a record change.',
      );
    });

    it("keeps a by that is an object", () => {
      const change = { ...added("leads", "1"), by: { runId: "r1" } };
      expect(parseRecordLines(formatRecordLines([change]), "leads", "leads.jsonl")).toEqual([
        change,
      ]);
    });

    it("refuses a line that holds a change to another collection", () => {
      expect(() =>
        parseRecordLines(formatRecordLines([added("orders", "1")]), "leads", "leads.jsonl"),
      ).toThrow(
        'Broken record log "leads.jsonl", line 1: it holds a change to another collection, "orders".',
      );
    });
  });
});
