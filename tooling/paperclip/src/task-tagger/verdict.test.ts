import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, test } from "vitest";
import { isTaggerLabel, labelsFor, parseVerdict } from "./verdict.ts";

verifies("paperclip.task-tagger", () => {
  describe("reading Haiku's answer", () => {
    test("reads the prompt's JSON, also inside a code fence", () => {
      const json = '{"kind": "code", "difficulty": "D3", "opus_only": true, "specified": false}';
      const expected = { kind: "code", difficulty: "D3", opusOnly: true };
      expect(parseVerdict(json)).toEqual(expected);
      expect(parseVerdict(`\`\`\`json\n${json}\n\`\`\``)).toEqual(expected);
    });

    test("refuses an answer that isn't the JSON asked for", () => {
      for (const answer of [
        "",
        "D2",
        "{not json}",
        '{"kind": "code", "difficulty": "D5", "opus_only": false}',
        '{"kind": "chores", "difficulty": "D2", "opus_only": false}',
        '{"kind": "code", "difficulty": "D2", "opus_only": "no"}',
      ]) {
        expect(parseVerdict(answer)).toBeUndefined();
      }
    });

    test("labels code only: a difficulty, and opus-only when it says so", () => {
      expect(labelsFor({ kind: "code", difficulty: "D1", opusOnly: false })).toEqual(["D1"]);
      expect(labelsFor({ kind: "code", difficulty: "D4", opusOnly: true })).toEqual([
        "D4",
        "opus-only",
      ]);
      expect(labelsFor({ kind: "ops", difficulty: "D4", opusOnly: true })).toEqual([]);
    });

    test("counts D1–D5 and opus-only as difficulty labels, in any case", () => {
      expect(["D1", "d5", " opus-only ", "OPUS-ONLY"].every(isTaggerLabel)).toBe(true);
      expect(["D6", "docs", "security"].some(isTaggerLabel)).toBe(false);
    });
  });
});
