import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, test } from "vitest";
import { labelsFor, readAnswer } from "./answer.ts";
import { handTagged, labelsAfter, shouldTag, type TaggerRecord } from "./decide.ts";
import { taggerInput } from "./prompt.ts";

const ownD2: TaggerRecord = { textHash: "hash-1", labels: ["d2"], written: true };

verifies("paperclip.difficulty-tagger-labels", () => {
  describe("reading the model's answer", () => {
    test("gives the difficulty and opus-only for code work", () => {
      const answer = readAnswer(
        '{"kind": "code", "difficulty": "D3", "opus_only": true, "specified": false, "model": "opus", "path": "full"}',
      );
      expect(answer).toEqual({ kind: "code", difficulty: "D3", opusOnly: true });
      expect(labelsFor(answer ?? never())).toEqual(["D3", "opus-only"]);
    });

    test("reads an answer inside a code fence", () => {
      const answer = readAnswer(
        '```json\n{"kind": "code", "difficulty": "D1", "opus_only": false}\n```',
      );
      expect(labelsFor(answer ?? never())).toEqual(["D1"]);
    });

    test("gives no labels for work that isn't code", () => {
      const answer = readAnswer('{"kind": "review", "difficulty": "D2", "opus_only": false}');
      expect(labelsFor(answer ?? never())).toEqual([]);
    });

    test("treats unknown values and text that isn't JSON as no answer", () => {
      for (const text of [
        '{"kind": "code", "difficulty": "D9", "opus_only": false}',
        '{"kind": "code", "difficulty": "D2", "opus_only": "yes"}',
        '{"kind": "chore", "difficulty": "D2", "opus_only": false}',
        "D2, opus-only",
        "[]",
        "{not json}",
      ]) {
        expect(readAnswer(text)).toBeUndefined();
      }
    });
  });

  describe("labels someone else set win", () => {
    test("a difficulty or opus-only label the tagger didn't write stops it", () => {
      expect(handTagged(["D2"], undefined)).toBe(true);
      expect(handTagged([" Opus-Only "], ownD2)).toBe(true);
      expect(shouldTag(["d2", "D4"], "hash-2", ownD2, true)).toBe(false);
      expect(shouldTag(["D2"], "hash-2", undefined, true)).toBe(false);
    });

    test("its own labels and other labels don't", () => {
      expect(handTagged(["D2", "studio"], ownD2)).toBe(false);
      expect(handTagged(["studio"], undefined)).toBe(false);
    });

    test("labels it only logged are not its own", () => {
      const logged: TaggerRecord = { ...ownD2, written: false };
      expect(handTagged(["D2"], logged)).toBe(true);
    });

    test("replaces only its own labels and keeps the rest", () => {
      expect(labelsAfter(["D2", "studio"], ["D4", "opus-only"], ownD2)).toEqual([
        "studio",
        "D4",
        "opus-only",
      ]);
      expect(labelsAfter(["studio"], ["D1"], undefined)).toEqual(["studio", "D1"]);
      expect(labelsAfter(["D2"], ["D2"], ownD2)).toEqual(["D2"]);
    });
  });
});

verifies("paperclip.difficulty-tagger-writes", () => {
  test("asks again only for new text or after the switch changed", () => {
    expect(shouldTag([], "hash-1", undefined, false)).toBe(true);
    expect(shouldTag(["D2"], "hash-1", ownD2, true)).toBe(false);
    expect(shouldTag(["D2"], "hash-2", ownD2, true)).toBe(true);
    expect(shouldTag([], "hash-1", { ...ownD2, written: false }, false)).toBe(false);
    expect(shouldTag([], "hash-1", { ...ownD2, written: false }, true)).toBe(true);
  });

  test("reads the title and the first 4,000 characters of the description", () => {
    expect(taggerInput("Fix the typo", null)).toBe("Fix the typo");
    expect(taggerInput("Fix the typo", `${"a".repeat(4000)}b`)).toBe(
      `Fix the typo\n\n${"a".repeat(4000)}`,
    );
  });
});

function never(): never {
  throw new Error("expected an answer");
}
